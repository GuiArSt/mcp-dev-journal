/**
 * Validation Helpers
 *
 * Type-safe validation functions for API routes.
 */

import { NextRequest } from "next/server";
import { z, ZodSchema, ZodError } from "zod";
import { ValidationError } from "../errors";

/**
 * Result type for validation
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/**
 * Validate request body against a Zod schema
 *
 * @example
 * const result = await validateBody(createDocumentSchema, request);
 * if (!result.success) {
 *   throw result.error;
 * }
 * const { title, content } = result.data;
 */
export async function validateBody<T>(
  schema: ZodSchema<T>,
  request: NextRequest
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    const data = schema.parse(body);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = formatZodError(error);
      return {
        success: false,
        error: new ValidationError("Invalid request body", details),
      };
    }
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: new ValidationError("Invalid JSON in request body"),
      };
    }
    throw error;
  }
}

/**
 * Validate URL search params against a Zod schema
 *
 * @example
 * const result = validateQuery(paginationSchema, request);
 * if (!result.success) {
 *   throw result.error;
 * }
 * const { limit, offset } = result.data;
 */
export function validateQuery<T>(schema: ZodSchema<T>, request: NextRequest): ValidationResult<T> {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const data = schema.parse(params);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = formatZodError(error);
      return {
        success: false,
        error: new ValidationError("Invalid query parameters", details),
      };
    }
    throw error;
  }
}

/**
 * Validate route params (from dynamic segments)
 *
 * @example
 * const result = validateParams(commitHashSchema, { commitHash: params.commitHash });
 * if (!result.success) {
 *   throw result.error;
 * }
 */
export function validateParams<T>(schema: ZodSchema<T>, params: unknown): ValidationResult<T> {
  try {
    const data = schema.parse(params);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = formatZodError(error);
      return {
        success: false,
        error: new ValidationError("Invalid route parameters", details),
      };
    }
    throw error;
  }
}

/**
 * Format Zod errors into a readable structure
 */
function formatZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return details;
}

/**
 * Helper to require body validation (throws on failure)
 *
 * @example
 * const data = await requireBody(createDocumentSchema, request);
 * // data is typed, or throws ValidationError
 */
export async function requireBody<T>(schema: ZodSchema<T>, request: NextRequest): Promise<T> {
  const result = await validateBody(schema, request);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Helper to require query validation (throws on failure)
 */
export function requireQuery<T>(schema: ZodSchema<T>, request: NextRequest): T {
  const result = validateQuery(schema, request);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

/**
 * Helper to require params validation (throws on failure)
 */
export function requireParams<T>(schema: ZodSchema<T>, params: unknown): T {
  const result = validateParams(schema, params);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
