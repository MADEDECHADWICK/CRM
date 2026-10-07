import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, AuthedRequest } from "../../middleware/authorize";
import { paginationSchema, pageOf } from "../../lib/pagination";
import { canManageStaff } from "@crm/core";

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
  // Validated here (uuid) and required. Previously the route read this from
  // the raw body and the rest of the body was spread into the create, which
  // let a client set id/createdAt and turned an unknown key into a 500.
  organizationId: z.string().uuid(),
});

// PATCH semantics differ from create: an empty string or null means "clear
// this field". The create-time emailField/phoneField fold "" to undefined,
// which the old PATCH loop then skipped — so a field could never actually be
// cleared. These schemas map "" and null to a real null instead.
const clearableText = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v))
  .optional();

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  title: clearableText,
  department: clearableText,
  email: z
    .union([z.string().trim().email("Enter a valid email address"), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  phone: z
    .union([z.string().trim().min(7, "Enter a valid phone number"), z.literal(""), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  isPrimary: z.boolean().optional(),
  notes: clearableText,
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

  const page = paginationSchema.safeParse(req.query);
  if (!page.success) {
    return res
      .status(400)
      .json({ success: false, error: { code: "VALIDATION_ERROR", message: page.error.message } });
  }

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
    ...pageOf(page.data),
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

  // Built from the PARSED payload only. Using `req.body` here was a mass
  // assignment hole: zod had already stripped unknown keys and coerced the
  // known ones, but the create ignored that and spread the raw body — so a
  // caller could set `id`/`createdAt` directly.
  const { organizationId, ...fields } = body.data;

  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return res
      .status(404)
      .json({ success: false, error: { code: "NOT_FOUND", message: "Organization not found" } });
  }

  // Only one primary per organization — promoting a contact demotes the
  // previous one in the same transaction. Serializable so two concurrent
  // promotions cannot both survive and leave the org with two primaries.
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
  }, { isolationLevel: "Serializable" });

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

  const body = updateSchema.safeParse(req.body);
  if (!body.success) {
    return res
      .status(400)
      .json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: body.error.message },
      });
  }

  // updateSchema has already turned "" / null into null and left omitted
  // fields undefined (Prisma's "leave unchanged").
  const data = body.data;

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
  }, { isolationLevel: "Serializable" });

  res.json({ success: true, data: contact });
});

contactsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  // Deleting a client's people is destructive and affects every deal on that
  // organization, so it is kept to the role that administers prospect data.
  // Reading and editing stay firm-wide (prospects are firm-wide), but removal
  // is restricted.
  if (!canManageStaff(req.user!.role)) {
    return res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Only Marketing & BD can delete a contact." },
    });
  }

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
