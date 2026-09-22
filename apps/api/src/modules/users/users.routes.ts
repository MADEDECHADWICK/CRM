import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Marketing & BD administers the team — it creates staff, assigns them to
// departments, and reassigns them between departments. Partners and Managers
// never create or edit staff, only BD does (the Team screen is BD-only).
function isBD(user: AuthedRequest["user"]): boolean {
  return user?.role === "MARKETING_BD";
}

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  role: z.enum(["MARKETING_BD", "PARTNER", "MANAGER"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).trim(),
  email: z.string().email(),
  role: z.enum(["PARTNER", "MANAGER"]),
  password: z.string().min(6).optional(),
  departmentId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  role: z.enum(["PARTNER", "MANAGER"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

const SELECT_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
} as const;

// Staff list — powers owner pickers across the app and the Team screen's
// member list. Never exposes passwordHash (BR: hashes stay server-side).
usersRouter.get("/", async (req: AuthedRequest, res) => {
  const query = listQuerySchema.safeParse(req.query);
  const role = query.success ? query.data.role : undefined;

  const users = await prisma.user.findMany({
    where: role ? { role } : {},
    select: SELECT_FIELDS,
    orderBy: { name: "asc" },
  });

  res.json({ success: true, data: users });
});

// Add a staff member (Partner or Manager). BD only. New hires get the demo
// password unless the admin sends one; the email is the login identity.
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
      passwordHash: bcrypt.hashSync(parsed.data.password ?? "password123", 10),
      departmentId: parsed.data.departmentId,
    },
    select: SELECT_FIELDS,
  });

  res.status(201).json({ success: true, data: user });
});

// Update a staff member — the school maths: reassign department, promote
// Manager to Partner, or fix a name. BD only. Passing departmentId: null
// unassigns the member from any department.
usersRouter.patch("/:id", async (req: AuthedRequest, res) => {
  if (!isBD(req.user)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Only Marketing & BD can manage staff.",
      },
    });
  }

  const params = idParamSchema.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  if (body.data.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: body.data.departmentId },
    });
    if (!department) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Department not found." },
      });
    }
  }

  const user = await prisma.user
    .update({
      where: { id: params.data.id },
      data: {
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.role !== undefined ? { role: body.data.role } : {}),
        ...(body.data.departmentId !== undefined
          ? { departmentId: body.data.departmentId }
          : {}),
      },
      select: SELECT_FIELDS,
    })
    .catch((error: { code?: string }) => {
      if (error?.code === "P2025") return null;
      throw error;
    });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    });
  }

  res.json({ success: true, data: user });
});