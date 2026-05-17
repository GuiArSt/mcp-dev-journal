import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { scanAiIntegrations } from "@/lib/ai-integrations";

export const POST = withErrorHandler(async () => {
  return NextResponse.json(scanAiIntegrations());
});
