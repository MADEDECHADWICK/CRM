export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "MARKETING_BD" | "PARTNER" | "MANAGER";
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};