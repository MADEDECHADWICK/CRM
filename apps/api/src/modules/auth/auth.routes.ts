import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { prisma } from "../../lib/prisma";
import {
  loginKey,
  loginBlockedFor,
  recordLoginFailure,
  clearLoginFailures,
} from "../../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    // `req.body ?? {}` so a `null`/missing body cannot crash the destructure,
    // and a type check so a non-string email/password is a clean 400 rather
    // than a 500 from `email.toLowerCase()` or bcrypt throwing.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawEmail = body.email;
    const rawPassword = body.password;

    // Missing / empty credentials — the same reply for both, so nothing about
    // whether the account exists can be inferred.
    if (!rawEmail || !rawPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_CREDENTIALS",
          message: "Email and password are required",
        },
      });
    }

    if (typeof rawEmail !== "string" || typeof rawPassword !== "string") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password must be strings",
        },
      });
    }

    const email = rawEmail;
    const password = rawPassword;

    // Throttle repeated failures against the same account from the same client
    // before doing any password work.
    const key = loginKey(req);
    const retryAfter = loginBlockedFor(key);
    if (retryAfter) {
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many failed login attempts. Please wait and try again.",
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
      recordLoginFailure(key);
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
      recordLoginFailure(key);
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
      recordLoginFailure(key);
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    clearLoginFailures(key);

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