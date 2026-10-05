import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { canManageStaff, canOwnOpportunity } from "@crm/core";

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
// Two rules are enforced here rather than left to the schema. The unique index
// on headId already stops one person leading two departments — that is caught
// as P2002 and reported as a 409 — but the database cannot know that a head
// must be able to own the deals they will be assigned by default, nor that
// they belong to the department they run.
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

  const department = await prisma.department.findUnique({
    where: { id: params.data.id },
    select: { id: true, name: true },
  });
  if (!department) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Department not found." },
    });
  }

  if (body.data.headId === null) {
    const cleared = await prisma.department.update({
      where: { id: department.id },
      data: { headId: null },
      include: { head: { select: { id: true, name: true, role: true } } },
    });
    return res.json({ success: true, data: cleared });
  }

  const appointee = await prisma.user.findUnique({
    where: { id: body.data.headId },
    select: { id: true, name: true, role: true, departmentId: true },
  });
  if (!appointee) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "That person does not exist." },
    });
  }

  // A head is the default owner of every deal raised in their department, so
  // they have to be somebody a deal can be owned by. Promoting Marketing & BD
  // to department head would create a person whose own department's deals
  // could not legally default to them.
  if (!canOwnOpportunity(appointee.role)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_HEAD",
        message: "A department head must be a Partner or Manager.",
        field: "headId",
      },
    });
  }

  // Membership and command are separate facts, but a head who is not in the
  // department they run is almost always a mistake — and a silent one, because
  // nothing about the appointment would look wrong on screen.
  if (appointee.departmentId !== department.id) {
    return res.status(400).json({
      success: false,
      error: {
        code: "HEAD_NOT_MEMBER",
        message: `${appointee.name} is not a member of ${department.name}. Add them to the department first.`,
        field: "headId",
      },
    });
  }

  try {
    const updated = await prisma.department.update({
      where: { id: department.id },
      data: { headId: appointee.id },
      include: { head: { select: { id: true, name: true, role: true } } },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    // The unique index on headId firing means they already lead another
    // department. Reported as a conflict with an explanation rather than
    // surfacing as a 500, because it is a rule the caller can act on.
    if ((error as { code?: string })?.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: {
          code: "ALREADY_HEADS_DEPARTMENT",
          message: `${appointee.name} already runs another department. A person can only head one.`,
          field: "headId",
        },
      });
    }
    throw error;
  }
});