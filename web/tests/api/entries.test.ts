/**
 * Tests for /api/entries route
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Create a proper chainable mock for Drizzle
function createDrizzleMock(entriesResult: unknown[] = [], countResult = 0, attachmentResult: unknown[] = []) {
  let queryStep = 0;

  const createChain = () => {
    const chain: Record<string, unknown> = {};

    const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'offset', 'groupBy'];

    methods.forEach(method => {
      chain[method] = vi.fn(() => {
        // When we reach the end of a chain (offset or groupBy), resolve with data
        if (method === 'offset') {
          queryStep++;
          if (queryStep === 1) {
            return Promise.resolve(entriesResult);
          }
        }
        if (method === 'where' && queryStep === 1) {
          // This is the count query
          queryStep++;
          return Promise.resolve([{ count: countResult }]);
        }
        if (method === 'groupBy') {
          return Promise.resolve(attachmentResult);
        }
        // Otherwise return the chain for more chaining
        return chain;
      });
    });

    return chain;
  };

  return createChain();
}

// Mock the drizzle module
vi.mock("@/lib/db/drizzle", () => {
  return {
    getDrizzleDb: vi.fn(),
    journalEntries: {
      id: "id",
      commitHash: "commitHash",
      repository: "repository",
      branch: "branch",
      author: "author",
      codeAuthor: "codeAuthor",
      teamMembers: "teamMembers",
      date: "date",
      why: "why",
      whatChanged: "whatChanged",
      decisions: "decisions",
      technologies: "technologies",
      kronusWisdom: "kronusWisdom",
      rawAgentReport: "rawAgentReport",
      createdAt: "createdAt",
    },
    entryAttachments: {
      commitHash: "commitHash",
    },
  };
});

import { GET } from "@/app/api/entries/route";
import { getDrizzleDb } from "@/lib/db/drizzle";

describe("/api/entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("should return entries with default pagination", async () => {
      const mockEntries = [
        {
          id: 1,
          commitHash: "abc1234",
          repository: "test-repo",
          branch: "main",
          author: "Test Author",
          codeAuthor: null,
          teamMembers: null,
          date: "2024-01-01",
          why: "Test reason",
          whatChanged: "Test changes",
          decisions: null,
          technologies: "TypeScript",
          kronusWisdom: null,
          rawAgentReport: "Test report",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      const mockDb = createDrizzleMock(mockEntries, 1, [{ commitHash: "abc1234", count: 2 }]);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest("http://localhost:3000/api/entries");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].commit_hash).toBe("abc1234");
      expect(data.total).toBe(1);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);
    });

    it("should filter by repository", async () => {
      const mockDb = createDrizzleMock([], 0, []);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest(
        "http://localhost:3000/api/entries?repository=my-repo"
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(0);
    });

    it("should filter by branch", async () => {
      const mockDb = createDrizzleMock([], 0, []);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest(
        "http://localhost:3000/api/entries?branch=develop"
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(0);
    });

    it("should respect custom pagination limits", async () => {
      const mockDb = createDrizzleMock([], 0, []);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest(
        "http://localhost:3000/api/entries?limit=10&offset=20"
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(20);
    });

    it("should enforce maximum limit of 100", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/entries?limit=200"
      );
      const response = await GET(request);

      // Should return validation error
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it("should return has_more correctly", async () => {
      const mockEntries = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: i,
          commitHash: `hash${i}`,
          repository: "test-repo",
          branch: "main",
          author: "Author",
          codeAuthor: null,
          teamMembers: null,
          date: "2024-01-01",
          why: "Why",
          whatChanged: "What",
          decisions: null,
          technologies: "Tech",
          kronusWisdom: null,
          rawAgentReport: "Report",
          createdAt: "2024-01-01T00:00:00Z",
        }));

      const mockDb = createDrizzleMock(mockEntries, 25, []);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest(
        "http://localhost:3000/api/entries?limit=10&offset=0"
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.has_more).toBe(true);
      expect(data.total).toBe(25);
    });

    it("should include attachment counts", async () => {
      const mockEntries = [
        {
          id: 1,
          commitHash: "abc1234",
          repository: "test-repo",
          branch: "main",
          author: "Author",
          codeAuthor: null,
          teamMembers: null,
          date: "2024-01-01",
          why: "Why",
          whatChanged: "What",
          decisions: null,
          technologies: "Tech",
          kronusWisdom: null,
          rawAgentReport: "Report",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ];

      const mockDb = createDrizzleMock(mockEntries, 1, [{ commitHash: "abc1234", count: 3 }]);
      vi.mocked(getDrizzleDb).mockReturnValue(mockDb as ReturnType<typeof getDrizzleDb>);

      const request = new NextRequest("http://localhost:3000/api/entries");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries[0].attachment_count).toBe(3);
    });
  });
});
