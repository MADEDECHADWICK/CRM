import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest, organizationScope } from "../../middleware/authorize";
import { canManageStaff } from "@crm/core";
import { prospectDirectoryWhere } from "../../lib/organizationViews";
import { publicUserSelect, updateUser, UserUpdateError } from "./userActions";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Marketing & BD administers the team — it creates staff, assigns them to
// departments, and reassigns them between departments. Partners and Managers
// never create or edit staff, only BD does (the Team screen is BD-only).
// canManageStaff is the shared definition, so a role added later is covered
// here without revisiting every screen that gates on it.
function isBD(user: AuthedRequest["user"]): boolean {
  return user ? canManageStaff(user.role) : false;
}


const listQuerySchema = z.object({
  role: z.enum(["MARKETING_BD", "PARTNER", "MANAGER"]).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["PARTNER", "MANAGER"]),
  // Required, with a length floor. A shared hardcoded default password made
  // every new account login-able with a publicly known secret; the admin
  // setting the first password is the only safe default.
  password: z.string().min(8, "Password must be at least 8 characters"),
  departmentId: z.string().uuid().optional(),
});

const SELECT_FIELDS = {
  ...publicUserSelect,
  _count: { select: { assignedProspects: { where: prospectDirectoryWhere() } } },
} as const;
const toUserPayload = (user: Awaited<ReturnType<typeof prisma.user.findMany<{ select: typeof SELECT_FIELDS }>>>[number]) => {
  const { _count, ...details } = user;
  return { ...details, assignedProspectCount: _count.assignedProspects };
};

usersRouter.get("/me", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: publicUserSelect });
  res.json({ success: true, data: user });
});

async function handleUpdate(req: AuthedRequest, res: import("express").Response, self: boolean) {
  const id = self ? req.user!.id : String(req.params.id);
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid member ID." } });
  try {
    const user = await prisma.$transaction(tx => updateUser(tx, req.user!, id, req.body, self), { isolationLevel: "Serializable" });
    return res.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof UserUpdateError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: error.issues.map(i => i.message).join(" ") } });
    if ((error as { code?: string }).code === "P2002") return res.status(409).json({ success: false, error: { code: "EMAIL_IN_USE", message: "A member with that email already exists." } });
    throw error;
  }
}
usersRouter.patch("/me", (req: AuthedRequest, res) => handleUpdate(req, res, true));

// Staff list — powers owner pickers across the app and the Team screen's
// member list. Never exposes passwordHash (BR: hashes stay server-side).
usersRouter.get("/", async (req: AuthedRequest, res) => {
  const query = listQuerySchema.safeParse(req.query);
  const role = query.success ? query.data.role : undefined;

  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    select: { ...SELECT_FIELDS, _count: { select: { assignedProspects: { where: { AND: [prospectDirectoryWhere(), organizationScope(req.user)] } } } } },
    orderBy: { name: "asc" },
  });

  res.json({ success: true, data: users.map(toUserPayload) });
});

// Add a staff member (Partner or Manager). BD only. The admin sets the initial
// password; the email is the login identity.
usersRouter.post("/", async (req: AuthedRequest, res) => {
  if (!isBD(req.user)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Only Marketing & BD can manage staff.",
      },
    });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.message },
    });
  }

  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: { code: "EMAIL_IN_USE", message: "A user with that email already exists." },
    });
  }

  if (parsed.data.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: parsed.data.departmentId },
    });
    if (!department) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Department not found." },
      });
    }
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      passwordHash: bcrypt.hashSync(parsed.data.password, 10),
      departmentId: parsed.data.departmentId,
    },
    select: SELECT_FIELDS,
  });

  res.status(201).json({ success: true, data: toUserPayload(user) });
});

// Admin updates never clear a Partner's independent department appointments.
usersRouter.patch("/:id", (req: AuthedRequest, res) => handleUpdate(req, res, false));
