import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { canManageStaff } from "@crm/core";

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

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  role: z.enum(["MARKETING_BD", "PARTNER", "MANAGER"]).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).trim(),
  email: z.string().email(),
  role: z.enum(["PARTNER", "MANAGER"]),
  // Required, with a length floor. A shared hardcoded default password made
  // every new account login-able with a publicly known secret; the admin
  // setting the first password is the only safe default.
  password: z.string().min(8, "Password must be at least 8 characters"),
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
  // Read only to derive headsDepartmentId below. A person leads at most one
  // department, so the array holds at most one entry — but the schema models
  // the inverse side of a one-to-one as a list, and flattening it here keeps
  // that detail out of every client.
  headedDepartments: { select: { id: true }, take: 1 },
} as const;

// Turns the one-headed-department relation into the flat field clients want.
// Present because the question clients actually ask runs the other way: when
// appointing somebody as a head, the useful fact is whether they already run a
// department somewhere else, and they cannot answer that from the department
// list alone.
const toUserPayload = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  headedDepartments: { id: string }[];
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  departmentId: user.departmentId,
  department: user.department,
  headsDepartmentId: user.headedDepartments[0]?.id ?? null,
});

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

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user
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

    // Making someone who is a member of one department the head of another left
    // them heading a department they no longer belong to. Clear the stale
    // appointment so "a head is a member" holds after every edit, not just at
    // appointment time. (A null departmentId matches every department, so
    // unassigning also frees any headship.)
    if (updated && body.data.departmentId !== undefined) {
      await tx.department.updateMany({
        where: { headId: params.data.id, id: { not: body.data.departmentId ?? "" } },
        data: { headId: null },
      });
    }

    return updated;
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    });
  }

  res.json({ success: true, data: toUserPayload(user) });
});