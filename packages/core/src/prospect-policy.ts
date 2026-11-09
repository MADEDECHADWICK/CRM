import type { Role } from "./crm-types";

export function canCreateProspect(role: Role): boolean {
  return role === "MARKETING_BD" || role === "PARTNER";
}

/** Department visibility alone does not authorize a Partner to hand off an account. */
export function canReassignProspect(actor: { id: string; role: Role }, assignedToId?: string | null): boolean {
  return actor.role === "MARKETING_BD" || (actor.role === "PARTNER" && assignedToId === actor.id);
}

/** Prospect responsibility includes administrators; deal ownership is separate. */
export function canReceiveProspect(role: Role): boolean {
  return role === "MARKETING_BD" || role === "PARTNER" || role === "MANAGER";
}
