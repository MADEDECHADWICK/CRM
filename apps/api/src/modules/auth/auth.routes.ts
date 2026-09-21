import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../lib/prisma";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate request
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CREDENTIALS",
          message: "Email and password are required",
        },
      });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase().trim(),
      },
    });

    // Don't reveal whether the email exists
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    // Make sure this user has a password configured
    if (!user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: {
          code: "PASSWORD_NOT_SET",
          message: "This account does not have a password configured",
        },
      });
    }

    // Verify password
    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    // Make sure JWT secret exists
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("JWT_SECRET is not configured");

      return res.status(500).json({
        success: false,
        error: {
          code: "JWT_SECRET_MISSING",
          message: "Authentication is not configured correctly",
        },
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
      },
      jwtSecret,
      {
        expiresIn: "7d",
      }
    );

    // Never send passwordHash to the client
    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "LOGIN_FAILED",
        message: "Unable to log in",
      },
    });
  }
});