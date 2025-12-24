/**
 * Vitest global test setup
 */

import { beforeAll, afterAll, afterEach } from "vitest";

// Mock environment variables for tests
beforeAll(() => {
  // NODE_ENV is set via vitest config
  // Add any test-specific env vars here
});

afterEach(() => {
  // Clean up after each test if needed
});

afterAll(() => {
  // Global cleanup
});
