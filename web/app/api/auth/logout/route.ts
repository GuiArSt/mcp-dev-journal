import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";

/**
 * POST /api/auth/logout
 *
 * Clear auth token cookie.
 */
export const POST = withErrorHandler(async () => {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth-token");
  return response;
});
