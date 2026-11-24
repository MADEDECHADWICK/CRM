import type { Role } from "./crm-types";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isAdmin: boolean;
  isActive?: boolean;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  headedDepartments?: { id: string; name: string }[];
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};
