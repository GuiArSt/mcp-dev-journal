"use client";

import { useEffect } from "react";
import { startClientErrorLog } from "@/lib/dev-client-errors";

/** Dev-only global listeners for uncaught errors. Mount once in the dashboard shell. */
export function ClientTelemetry() {
  useEffect(() => {
    startClientErrorLog();
  }, []);
  return null;
}
