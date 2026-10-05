import type { AuthUser } from "@crm/core";

export type StoredSession = {
  token: string;
  user: AuthUser;
};