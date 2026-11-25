import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { canManageStaff } from "@crm/core";
import type { AccessUser } from "../../lib/accessScope";

const name = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().email();
const STAFF_ROLES = [
  "MARKETING_BD",
  "PARTNER",
  "MANAGER",
  "PROPOSAL_COORDINATOR",
  "TECHNICAL_REVIEWER",
  "COUNTRY_LEAD",
  "IT_ADMIN",
] as const;

export const staffUpdateSchema = z.object({
  name: name.optional(), email: email.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  supervisorPartnerId: z.string().uuid().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "Provide details to update.");
export const profileUpdateSchema = z.object({
  name: name.optional(), email: email.optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
}).strict().refine(value => value.name !== undefined || value.email !== undefined || value.newPassword !== undefined, "Provide details to update.");

export const publicUserSelect = {
  id: true, name: true, email: true, role: true, isAdmin: true, isActive: true, departmentId: true,
  supervisorPartnerId: true,
  supervisorPartner: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  headedDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" as const } },
} as const;

export class UserUpdateError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// The same service powers HTTP and rollback-only integration verification.
export async function updateUser(tx: Prisma.TransactionClient, actor: AccessUser, id: string, input: unknown, self = false) {
  if (self ? id !== actor.id : !canManageStaff(actor.role, actor.isAdmin)) {
    throw new UserUpdateError(403, "FORBIDDEN", "You cannot edit this member.");
  }
  const user = await tx.user.findUnique({ where: { id }, include: { headedDepartments: { select: { id: true } } } });
  if (!user) throw new UserUpdateError(404, "NOT_FOUND", "Member not found.");
  let data: Prisma.UserUncheckedUpdateInput;
  if (self) {
    const values = profileUpdateSchema.parse(input);
    if (values.newPassword !== undefined || (values.email !== undefined && values.email !== user.email)) {
      if (!user.passwordHash || !values.currentPassword || !await bcrypt.compare(values.currentPassword, user.passwordHash)) {
        throw new UserUpdateError(400, "PASSWORD_INCORRECT", "Enter your current password to change your email or password.");
      }
    }
    data = {
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.email !== undefined ? { email: values.email } : {}),
      ...(values.newPassword !== undefined ? { passwordHash: await bcrypt.hash(values.newPassword, 10) } : {}),
    };
  } else {
    const values = staffUpdateSchema.parse(input);
    if (user.role === "MARKETING_BD" && values.role !== undefined) throw new UserUpdateError(400, "ADMIN_ROLE_PROTECTED", "The administrator role cannot be changed here.");
    if (values.isAdmin === false && user.isAdmin) {
      const remainingAdmins = await tx.user.count({ where: { isAdmin: true, id: { not: id } } });
      if (remainingAdmins === 0) throw new UserUpdateError(409, "LAST_ADMIN", "At least one administrator must remain.");
    }
    if (values.departmentId && !await tx.department.findUnique({ where: { id: values.departmentId }, select: { id: true } })) {
      throw new UserUpdateError(400, "INVALID_DEPARTMENT", "Department not found.");
    }
    const nextRole = values.role ?? user.role;
    const nextDepartment = values.departmentId === undefined ? user.departmentId : values.departmentId;
    if (nextRole === "MANAGER" && user.headedDepartments.some(d => d.id !== nextDepartment)) {
      throw new UserUpdateError(409, "HEADSHIP_CONFLICT", "Reappoint the heads of other departments before making this person a Manager or changing their primary department.");
    }
    if (values.supervisorPartnerId) {
      const supervisor = await tx.user.findUnique({ where: { id: values.supervisorPartnerId }, select: { role: true, isActive: true } });
      if (!supervisor || !supervisor.isActive || supervisor.role !== "PARTNER") {
        throw new UserUpdateError(400, "INVALID_SUPERVISOR", "A team lead must report to an active Partner.");
      }
    }
    const nextSupervisor = values.supervisorPartnerId === undefined ? user.supervisorPartnerId : values.supervisorPartnerId;
    if (nextRole === "MANAGER" && !nextSupervisor) {
      throw new UserUpdateError(400, "SUPERVISOR_REQUIRED", "Choose the Partner this team lead reports to.");
    }
    // Disabling a leaver preserves history. The account is blocked at request
    // time by requireAuth; records remain attributable.
    data = {
      ...values,
      ...(values.isActive === false ? { deactivatedAt: new Date() } : {}),
      ...(values.isActive === true ? { deactivatedAt: null } : {}),
    };
  }
  if (typeof data.email === "string") {
    const duplicate = await tx.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" }, id: { not: id } }, select: { id: true } });
    if (duplicate) throw new UserUpdateError(409, "EMAIL_IN_USE", "A member with that email already exists.");
  }
  // Partner headships remain intact when primary membership changes.
  return tx.user.update({ where: { id }, data, select: publicUserSelect });
}
