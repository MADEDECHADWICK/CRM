// packages/core/src/proposal-readiness.ts
//
// The "no half-filled client records" policy (BR-020).
//
// WHY THIS IS NOT JUST "make every field required" — the reasoning matters
// because it is the one place this design deliberately does the opposite of
// what was literally asked.
//
// Over-requiring fields at data entry produces WORSE data, not better. Ask
// someone to complete a twelve-field form before they can save and they type
// "test", "n/a" and "123" to get past it. The database ends up full and
// meaningless, and every downstream report is quietly wrong in a way nobody
// can see. The failure mode is silent, which is the worst kind.
//
// So completeness is gated by moment rather than by screen. A field is
// required when it becomes TRUE, not when the form opens:
//
//   Tier 1 — required to save the record at all.
//            Nearly empty is never a legitimate state of a client.
//
//   Tier 2 — required before the deal may become a PROPOSAL.
//            This is the moment the firm is about to commit to a number in
//            writing, and it is the moment a missing decision-maker's email
//            or phone actually costs money. It is also the last moment at
//            which the missing detail is cheap to obtain: once the proposal
//            is out, chasing a signature for three weeks because we only had
//            a switchboard number is the exact failure this prevents.
//
// The split also spreads the cost. Twelve fields at entry is a wall nobody
// converts on. The same twelve, spread across capture and the proposal gate,
// is a form people finish — and the gate sits precisely where the person
// already cares about the outcome.

/**
 * The narrow shape the gate actually reads.
 *
 * Structural rather than the full Organization/Contact types on purpose: the
 * API holds Prisma models whose dates are `Date` where the shared client
 * types say `string`, so accepting the whole entity would force a cast at
 * every call site. The gate only ever looks at the fields below, and
 * declaring exactly those means a caller cannot quietly widen its
 * responsibility or a signature change here can never break a route.
 */
export type ReadinessOrganization = {
  industry?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type ReadinessContact = {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
};

/** A field the firm needs before it will write a proposal for this client. */
export type MissingField = {
  /** Stable machine key, safe to send over the wire. */
  field: string;
  /** Human sentence for the API error or the on-screen prompt. */
  message: string;
  /**
   * Where the gap is: the client organization itself, or the named
   * decision-maker. Separate because the fix for the two is different —
   * one is a phone call to reception, the other is finding out who the
   * finance lead is.
   */
  scope: "ORGANIZATION" | "CONTACT";
};

export type ProposalReadinessInput = {
  organization?: ReadinessOrganization | null;
  contacts?: ReadinessContact[] | null;
};

/**
 * The decision-maker the gate is actually judging.
 *
 * Prefers the contact explicitly marked primary, because that flag is the
 * firm's own statement about who matters. Falls back to the first contact
 * rather than requiring the flag to be set, so a record captured before the
 * flag existed is not permanently blocked from progressing.
 */
function decisionMaker(
  contacts: ReadinessContact[] | null | undefined
): ReadinessContact | null {
  if (!contacts?.length) return null;
  return contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
}

/**
 * Everything still missing before this deal can become a PROPOSAL.
 *
 * Returns an empty array when the record is ready. The API treats a
 * non-empty result as a hard rejection; the clients render it as a
 * checklist. One definition, so the list a user is shown is exactly the
 * list the server will enforce.
 *
 * `NOW` is not involved — this is a completeness check, not a deadline, and
 * keeping it date-free means the same function is safe to call from a form
 * that is being filled in at any point in the deal's life.
 */
export function missingForProposal(
  input: ProposalReadinessInput
): MissingField[] {
  const missing: MissingField[] = [];
  const org = input.organization;

  if (!org) {
    missing.push({
      field: "organization",
      scope: "ORGANIZATION",
      message: "This deal is not linked to a client organization.",
    });
  } else {
    if (!org.industry?.trim()) {
      missing.push({
        field: "organization.industry",
        scope: "ORGANIZATION",
        message: "Add the client's industry.",
      });
    }
    if (!org.email?.trim()) {
      missing.push({
        field: "organization.email",
        scope: "ORGANIZATION",
        message: "Add the client's email address.",
      });
    }
    if (!org.phone?.trim()) {
      missing.push({
        field: "organization.phone",
        scope: "ORGANIZATION",
        message: "Add the client's phone number.",
      });
    }
    if (!org.address?.trim()) {
      missing.push({
        field: "organization.address",
        scope: "ORGANIZATION",
        message: "Add the client's physical address.",
      });
    }
  }

  const contact = decisionMaker(input.contacts);

  if (!contact) {
    missing.push({
      field: "contact",
      scope: "CONTACT",
      message: "Add at least one named contact at the client.",
    });
  } else {
    if (!contact.title?.trim()) {
      missing.push({
        field: "contact.title",
        scope: "CONTACT",
        message: `Add ${contact.name}'s job title.`,
      });
    }
    // Both, not either. An email with no phone means waiting on an inbox
    // reply; a phone with no email means you cannot send the proposal at
    // all. The existing "email OR phone" rule is the reason proposals stall
    // for weeks, and it is exactly the rule this gate is here to tighten.
    if (!contact.email?.trim()) {
      missing.push({
        field: "contact.email",
        scope: "CONTACT",
        message: `Add ${contact.name}'s email address.`,
      });
    }
    if (!contact.phone?.trim()) {
      missing.push({
        field: "contact.phone",
        scope: "CONTACT",
        message: `Add ${contact.name}'s phone number.`,
      });
    }
  }

  return missing;
}

/** Convenience predicate for callers that only need the yes/no. */
export function isProposalReady(input: ProposalReadinessInput): boolean {
  return missingForProposal(input).length === 0;
}
