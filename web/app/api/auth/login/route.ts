import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, generateToken } from "@/lib/auth";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody, loginSchema } from "@/lib/validations";
import { UnauthorizedError } from "@/lib/errors";

/**
 * POST /api/auth/login
 * Authenticate user with password
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const { password } = await requireBody(loginSchema, request);

  const isValid = await verifyPassword(password);
  if (!isValid) {
    throw new UnauthorizedError("Invalid password");
  }

  const token = generateToken({ id: "admin", email: "admin@journal.local" });

  const response = NextResponse.json({ success: true });
  response.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
});










