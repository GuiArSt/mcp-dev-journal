/**
 * Tests for validation schemas and helpers
 */

import { describe, it, expect } from "vitest";
import {
  paginationSchema,
  journalQuerySchema,
  commitHashSchema,
  createDocumentSchema,
  loginSchema,
  createSkillSchema,
} from "@/lib/validations/schemas";

describe("paginationSchema", () => {
  it("should use defaults when no params provided", () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ limit: 50, offset: 0 });
  });

  it("should coerce string numbers", () => {
    const result = paginationSchema.parse({ limit: "20", offset: "10" });
    expect(result).toEqual({ limit: 20, offset: 10 });
  });

  it("should reject limit over 100", () => {
    expect(() => paginationSchema.parse({ limit: 150 })).toThrow();
  });

  it("should reject negative offset", () => {
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
  });
});

describe("journalQuerySchema", () => {
  it("should extend pagination with optional filters", () => {
    const result = journalQuerySchema.parse({
      repository: "my-repo",
      branch: "main",
      limit: "10",
    });
    expect(result).toEqual({
      repository: "my-repo",
      branch: "main",
      limit: 10,
      offset: 0,
    });
  });

  it("should work without filters", () => {
    const result = journalQuerySchema.parse({});
    expect(result.repository).toBeUndefined();
    expect(result.branch).toBeUndefined();
  });
});

describe("commitHashSchema", () => {
  it("should accept valid commit hash", () => {
    const result = commitHashSchema.parse({ commitHash: "abc1234" });
    expect(result.commitHash).toBe("abc1234");
  });

  it("should accept full hash", () => {
    const fullHash = "abc1234567890abcdef1234567890abcdef12345678";
    const result = commitHashSchema.parse({ commitHash: fullHash });
    expect(result.commitHash).toBe(fullHash);
  });

  it("should reject short hash", () => {
    expect(() => commitHashSchema.parse({ commitHash: "abc12" })).toThrow(
      /at least 7 characters/
    );
  });
});

describe("createDocumentSchema", () => {
  it("should validate complete document", () => {
    const result = createDocumentSchema.parse({
      title: "My Document",
      slug: "my-document",
      type: "writing",
      content: "Hello world",
    });
    expect(result.title).toBe("My Document");
    expect(result.language).toBe("en"); // default
    expect(result.metadata).toEqual({}); // default
  });

  it("should reject invalid slug format", () => {
    expect(() =>
      createDocumentSchema.parse({
        title: "Test",
        slug: "My Document", // has spaces and uppercase
        content: "test",
      })
    ).toThrow(/lowercase alphanumeric/);
  });

  it("should require title and content", () => {
    expect(() =>
      createDocumentSchema.parse({
        slug: "test",
        content: "test",
      })
    ).toThrow();

    expect(() =>
      createDocumentSchema.parse({
        title: "Test",
        slug: "test",
      })
    ).toThrow();
  });

  it("should default type to writing", () => {
    const result = createDocumentSchema.parse({
      title: "Test",
      slug: "test",
      content: "Hello",
    });
    expect(result.type).toBe("writing");
  });
});

describe("loginSchema", () => {
  it("should require password", () => {
    expect(() => loginSchema.parse({})).toThrow();
    expect(() => loginSchema.parse({ password: "" })).toThrow(/required/);
  });

  it("should accept valid password", () => {
    const result = loginSchema.parse({ password: "secret123" });
    expect(result.password).toBe("secret123");
  });
});

describe("createSkillSchema", () => {
  it("should validate complete skill", () => {
    const result = createSkillSchema.parse({
      id: "react-native",
      name: "React Native",
      category: "Languages & Frameworks",
      magnitude: 4,
      description: "Mobile development framework",
    });
    expect(result.id).toBe("react-native");
    expect(result.tags).toEqual([]); // default
  });

  it("should reject invalid ID format", () => {
    expect(() =>
      createSkillSchema.parse({
        id: "React Native", // spaces and uppercase
        name: "React Native",
        category: "Frameworks",
        magnitude: 4,
        description: "Test",
      })
    ).toThrow(/lowercase alphanumeric/);
  });

  it("should reject magnitude out of range", () => {
    expect(() =>
      createSkillSchema.parse({
        id: "test",
        name: "Test",
        category: "Test",
        magnitude: 0, // too low
        description: "Test",
      })
    ).toThrow();

    expect(() =>
      createSkillSchema.parse({
        id: "test",
        name: "Test",
        category: "Test",
        magnitude: 6, // too high
        description: "Test",
      })
    ).toThrow();
  });

  it("should accept optional URL or empty string", () => {
    const withUrl = createSkillSchema.parse({
      id: "test",
      name: "Test",
      category: "Test",
      magnitude: 3,
      description: "Test",
      url: "https://example.com",
    });
    expect(withUrl.url).toBe("https://example.com");

    const emptyUrl = createSkillSchema.parse({
      id: "test",
      name: "Test",
      category: "Test",
      magnitude: 3,
      description: "Test",
      url: "",
    });
    expect(emptyUrl.url).toBe("");
  });
});
