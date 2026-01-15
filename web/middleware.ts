import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const isAuthPage = request.nextUrl.pathname === "/login";
  const isApiAuth = request.nextUrl.pathname.startsWith("/api/auth");
  const isHealthCheck = request.nextUrl.pathname === "/api/health";
  const isMcpResources = request.nextUrl.pathname.startsWith("/api/mcp");
  const isAttachmentDownload = request.nextUrl.pathname.match(/^\/api\/attachments\/\d+\/raw$/);

  // MCP server access - check for MCP API key header
  const mcpApiKey = request.headers.get("x-mcp-api-key");
  const isMcpRequest = mcpApiKey === process.env.MCP_API_KEY && process.env.MCP_API_KEY;

  // Repository endpoints accessible via MCP API key
  const isMcpRepositoryAccess = isMcpRequest && (
    request.nextUrl.pathname.startsWith("/api/documents") ||
    request.nextUrl.pathname.startsWith("/api/cv/") ||
    request.nextUrl.pathname.startsWith("/api/portfolio-projects") ||
    request.nextUrl.pathname.startsWith("/api/media")
  );

  // Allow auth API, health check, MCP resources, attachment downloads, and MCP repository access
  if (isApiAuth || isHealthCheck || isMcpResources || isAttachmentDownload || isMcpRepositoryAccess) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated and not on auth page
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect to home if authenticated and on login page
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};










