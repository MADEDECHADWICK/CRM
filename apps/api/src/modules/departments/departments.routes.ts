import { setDepartmentHead } from "./departmentActions";
import { UserUpdateError } from "../users/userActions";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { canManageStaff } from "@crm/core";

export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

// Marketing & BD administers the department structure — Partners and
// Managers read opportunities, not the org chart.
//
// Expressed as the shared policy rather than a local comparison, so "who
// administers" has one definition rather than the several role comparisons
// this codebase grew before the policy was centralised.
function isBD(user: AuthedRequest["user"]): boolean {
  return user ? canManageStaff(user.role) : false;
}

const createSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().optional(),
});

// null clears the appointment. Clearing is a normal operation rather than an
// edge case: a department whose head leaves must be able to stop naming them
// without deleting the department, and leaving a stale head would keep routing
// new deals to somebody who has gone.
const setHeadSchema = z.object({
  headId: z.string().uuid().nullable(),
});

// All departments with their current staff count — the Team screen's
// department cards render memberCount straight from this and also use it
// for the department picker when adding/reassigning members.
//
// The head travels with the list rather than being fetched on demand: it is
// what a client needs to pre-select the default owner of any new deal, so
// every caller of this endpoint wants it and none should have to know it
// exists as a separate question.
departmentsRouter.get("/", async (_req: AuthedRequest, res) => {
  const departments = await prisma.department.findMany({
    include: {
      _count: { select: { users: true } },
      head: { select: { id: true, name: true, role: true } },
    },
    orderBy: { name: "asc" },
  });

  res.json({
    success: true,
    data: departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      description: dept.description,
      // Null until somebody is appointed. Clients must handle it: an unheaded
      // department means the owner is chosen explicitly rather than defaulted.
      headId: dept.headId,
      head: dept.head,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
      memberCount: dept._count.users,
    })),
  });
});

// Create a department on the fly when a new service line spins up. BD only.
// Name is unique (schema-level), so a duplicate name is a 409.
departmentsRouter.post("/", async (req: AuthedRequest, res) => {
  if (!isBD(req.user)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Only Marketing & BD can manage departments.",
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

  const department = await prisma.department
    .create({ data: { ...parsed.data } })
    .catch((error: { code?: string }) => {
      if (error?.code === "P2002") return null;
      throw error;
    });

  if (!department) {
    return res.status(409).json({
      success: false,
      error: { code: "NAME_IN_USE", message: "A department with that name already exists." },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      id: department.id,
      name: department.name,
      description: department.description,
      headId: department.headId,
      // A department is created empty, so nobody runs it yet.
      head: null,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
      memberCount: 0,
    },
  });
});

// ── Appointing a department head ──
//
// Without this the headId column is inert: every department would sit at null
// and every new deal would need an owner chosen by hand, which is the manual
// version of the job appointing somebody was supposed to do.
//
// Partners may lead multiple departments independently of primary membership.
const setHeadParamsSchema = z.object({ id: z.string().uuid() });

departmentsRouter.patch("/:id/head", async (req: AuthedRequest, res) => {
  if (!isBD(req.user)) {
    return res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "Only Marketing & BD can appoint a department head.",
      },
    });
  }

  const params = setHeadParamsSchema.safeParse(req.params);
  const body = setHeadSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: (params.error ?? body.error)?.message },
    });
  }

  try {
    const data = await prisma.$transaction(tx => setDepartmentHead(tx, req.user!, params.data.id, body.data.headId), { isolationLevel: "Serializable" });
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof UserUpdateError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    throw error;
  }
});
