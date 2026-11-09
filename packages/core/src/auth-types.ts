export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "MARKETING_BD" | "PARTNER" | "MANAGER";
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
