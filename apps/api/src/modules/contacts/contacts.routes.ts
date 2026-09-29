import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const emailField = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal("").transform(() => undefined));

const phoneField = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .optional()
  .or(z.literal("").transform(() => undefined));

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  title: z.string().trim().optional(),
  department: z.string().trim().optional(),
  email: emailField,
  phone: phoneField,
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().optional(),
});

// A contact always belongs to an organization, so every read/write is
// filtered through it rather than trusting a bare contact id.
const withOrganization = { organization: true } as const;

// Parsed rather than read straight off req.params: Express types a param as
// `string | string[]`, and an unvalidated id also reaches Prisma as a
// non-UUID and surfaces as an unhandled 500 instead of a 400.
const idParamSchema = z.object({ id: z.string().uuid() });

function parseId(req: AuthedRequest, res: Response): string | null {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) {
    res
      .status(400)
      .json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid contact id." } });
    return null;
  }
  return params.data.id;
}

// At least one way to reach the person is required, otherwise the contact is
// a name with nothing actionable on it.
function isReachable(fields: { email?: string; phone?: string }) {
  return Boolean(fields.email || fields.phone);
}

contactsRouter.get("/", async (req: AuthedRequest, res) => {
  const organizationId =
    typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

  const contacts = await prisma.contact.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      // Search spans name, job title and email so "jane" or "finance" both
      // find the right person.
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { title: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: withOrganization,
    // Primary contact first, then alphabetical — the person you call by
    // default should be at the top of the list.
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });

  res.json({ success: true, data: contacts });
});

contactsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const id = parseId(req, res);
  if (!id) return;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: withOrganization,
  });

  if (!contact) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
  }

  res.json({ success: true, data: contact });
});

contactsRouter.post("/", async (req: AuthedRequest, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: body.error.message },
      });
  }

  if (!isReachable(body.data)) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Add an email or a phone number" },
    });
  }

  const { organizationId, ...fields } = req.body as {
    organizationId: string;
  } & z.infer<typeof createSchema>;

  if (!organizationId || typeof organizationId !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "An organization is required" },
    });
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found" } });
  }

  // Only one primary per organization — promoting a contact demotes the
  // previous one in the same transaction.
  const contact = await prisma.$transaction(async (tx) => {
    if (fields.isPrimary) {
      await tx.contact.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.contact.create({
      data: {
        ...fields,
        organizationId,
      },
      include: withOrganization,
    });
  });

  res.status(201).json({ success: true, data: contact });
});

contactsRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const id = parseId(req, res);
  if (!id) return;

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
  }

  const body = createSchema.partial().safeParse(req.body);
  if (!body.success) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: body.error.message },
      });
  }

  // An empty string means "clear this field" in the UI, but Prisma treats
  // undefined as "leave unchanged" — so translate blank strings to null
  // instead of letting them silently no-op.
  const data: Record<string, unknown> = { ...body.data };
  for (const key of ["title", "department", "email", "phone", "notes"] as const) {
    if (data[key] === undefined) continue;
    data[key] = data[key] === "" ? null : data[key];
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.contact.updateMany({
        where: {
          organizationId: existing.organizationId,
          isPrimary: true,
          id: { not: existing.id },
        },
        data: { isPrimary: false },
      });
    }

    return tx.contact.update({
      where: { id: existing.id },
      data,
      include: withOrganization,
    });
  });

  res.json({ success: true, data: contact });
});

contactsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = parseId(req, res);
  if (!id) return;

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
  }

  await prisma.contact.delete({ where: { id: existing.id } });

  res.json({ success: true, data: { id: existing.id } });
});
