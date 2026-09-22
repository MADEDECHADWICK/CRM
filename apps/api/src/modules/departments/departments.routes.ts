import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";

export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

// Marketing & BD administers the department structure — Partners and
// Managers read opportunities, not the org chart.
function isBD(user: AuthedRequest["user"]): boolean {
  return user?.role === "MARKETING_BD";
}

const createSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().optional(),
});

// All departments with their current staff count — the Team screen's
// department cards render memberCount straight from this and also use it
// for the department picker when adding/reassigning members.
departmentsRouter.get("/", async (_req: AuthedRequest, res) => {
  const departments = await prisma.department.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });

  res.json({
    success: true,
    data: departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      description: dept.description,
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
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
      memberCount: 0,
    },
  });
});