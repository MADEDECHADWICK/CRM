import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";

export const authRouter = Router();

// Simplified for an internal tool — a real login would check a hashed
// password. For now this proves the token/role flow end to end.
authRouter.post("/login", async (req, res) => {
  const { userId } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ success: false, error: { code: "USER_NOT_FOUND" } });

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET!, { expiresIn: "7d" });
  res.json({ success: true, data: { token, user } });
});