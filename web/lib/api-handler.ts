/**
 * API Route Handler Wrapper
 *
 * Provides consistent error handling for all API routes.
 * Wraps route handlers to catch and format errors properly.
 */

import { NextRequest, NextResponse } from "next/server";
import { AppError, isAppError, getErrorMessage } from "./errors";

type RouteHandler<T = unknown> = (
  request: NextRequest,
  context?: { params: Promise<T> }
) => Promise<NextResponse>;

/**
 * Wrap an API route handler with error handling
 *
 * @example
 * export const GET = withErrorHandler(async (req) => {
 *   const data = await fetchData();
 *   return NextResponse.json(data);
 * });
 */
export function withErrorHandler<T = unknown>(handler: RouteHandler<T>): RouteHandler<T> {
  return async (request: NextRequest, context?: { params: Promise<T> }) => {
    try {
      return await handler(request, context);
    } catch (error) {
      // Handle known application errors
      if (isAppError(error)) {
        console.error(`[API Error] ${error.code}: ${error.message}`);
        return NextResponse.json(error.toJSON(), { status: error.statusCode });
      }

      // Handle unexpected errors
      console.error("[API Error] Unhandled:", error);
      return NextResponse.json(
        {
          error: "Internal server error",
          code: "INTERNAL_ERROR",
          message: process.env.NODE_ENV === "development" ? getErrorMessage(error) : undefined,
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Create a JSON response with proper typing
 */
export function jsonResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status: number = 500, code?: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}
