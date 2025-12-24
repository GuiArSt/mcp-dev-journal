/**
 * Tests for typed error classes
 */

import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  isAppError,
  getErrorMessage,
} from "@/lib/errors";

describe("AppError", () => {
  it("should create error with message and default status", () => {
    const error = new AppError("Something went wrong");
    expect(error.message).toBe("Something went wrong");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBeUndefined();
  });

  it("should create error with custom status and code", () => {
    const error = new AppError("Bad request", 400, "BAD_REQUEST");
    expect(error.message).toBe("Bad request");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
  });

  it("should serialize to JSON correctly", () => {
    const error = new AppError("Test error", 400, "TEST");
    const json = error.toJSON();
    expect(json).toEqual({
      error: "Test error",
      code: "TEST",
      statusCode: 400,
    });
  });
});

describe("NotFoundError", () => {
  it("should create 404 error with resource name", () => {
    const error = new NotFoundError("Document");
    expect(error.message).toBe("Document not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("should include identifier when provided", () => {
    const error = new NotFoundError("Document", "my-doc-slug");
    expect(error.message).toBe("Document 'my-doc-slug' not found");
  });
});

describe("ValidationError", () => {
  it("should create 400 error with message", () => {
    const error = new ValidationError("Invalid input");
    expect(error.message).toBe("Invalid input");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("should include field details in JSON", () => {
    const error = new ValidationError("Validation failed", {
      email: ["Invalid email format"],
      password: ["Too short", "Must contain number"],
    });

    const json = error.toJSON();
    expect(json.details).toEqual({
      email: ["Invalid email format"],
      password: ["Too short", "Must contain number"],
    });
  });
});

describe("UnauthorizedError", () => {
  it("should create 401 error with default message", () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe("Authentication required");
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("should accept custom message", () => {
    const error = new UnauthorizedError("Invalid token");
    expect(error.message).toBe("Invalid token");
  });
});

describe("ForbiddenError", () => {
  it("should create 403 error", () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });
});

describe("ConflictError", () => {
  it("should create 409 error", () => {
    const error = new ConflictError("Entry already exists");
    expect(error.message).toBe("Entry already exists");
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });
});

describe("DatabaseError", () => {
  it("should create 500 error with operation name", () => {
    const error = new DatabaseError("insert");
    expect(error.message).toBe("Database error during insert");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("DATABASE_ERROR");
  });

  it("should preserve original error", () => {
    const original = new Error("SQLITE_CONSTRAINT");
    const error = new DatabaseError("insert", original);
    expect(error.originalError).toBe(original);
  });
});

describe("isAppError", () => {
  it("should return true for AppError instances", () => {
    expect(isAppError(new AppError("test"))).toBe(true);
    expect(isAppError(new NotFoundError("test"))).toBe(true);
    expect(isAppError(new ValidationError("test"))).toBe(true);
  });

  it("should return false for regular errors", () => {
    expect(isAppError(new Error("test"))).toBe(false);
    expect(isAppError("error")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("getErrorMessage", () => {
  it("should extract message from Error", () => {
    expect(getErrorMessage(new Error("test message"))).toBe("test message");
  });

  it("should return string as-is", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("should return default for unknown types", () => {
    expect(getErrorMessage(null)).toBe("An unknown error occurred");
    expect(getErrorMessage(undefined)).toBe("An unknown error occurred");
    expect(getErrorMessage(123)).toBe("An unknown error occurred");
  });
});
