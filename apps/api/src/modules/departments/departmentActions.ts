import type { Prisma } from "../../../generated/prisma/client";
import { canManageStaff } from "@crm/core";
import type { AccessUser } from "../../lib/accessScope";
import { UserUpdateError } from "../users/userActions";

export async function setDepartmentHead(tx: Prisma.TransactionClient, actor: AccessUser, departmentId: string, headId: string | null) {
  if (!canManageStaff(actor.role, actor.isAdmin)) throw new UserUpdateError(403, "FORBIDDEN", "Only administrators can appoint department heads.");
  const department = await tx.department.findUnique({ where: { id: departmentId }, select: { id: true } });
  if (!department) throw new UserUpdateError(404, "NOT_FOUND", "Department not found.");
  if (headId) {
    const person = await tx.user.findUnique({ where: { id: headId }, select: { role: true, departmentId: true } });
    if (!person || (person.role !== "PARTNER" && person.role !== "MANAGER")) throw new UserUpdateError(400, "INVALID_HEAD", "Choose a Partner or Manager.");
    if (person.role === "MANAGER" && person.departmentId !== departmentId) throw new UserUpdateError(400, "HEAD_NOT_MEMBER", "A Manager can head only their primary department. Partners may head several departments.");
  }
  return tx.department.update({ where: { id: departmentId }, data: { headId }, include: { head: { select: { id: true, name: true, role: true } } } });
}
