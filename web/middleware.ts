import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const isAuthPage = request.nextUrl.pathname === "/login";
  const isApiAuth = request.nextUrl.pathname.startsWith("/api/auth");
  const isHealthCheck = request.nextUrl.pathname === "/api/health";
  const isMcpResources = request.nextUrl.pathname.startsWith("/api/mcp");
  const isAttachmentDownload = request.nextUrl.pathname.match(/^\/api\/attachments\/\d+\/raw$/);

  // Allow auth API, health check, MCP resources, and attachment downloads
  if (isApiAuth || isHealthCheck || isMcpResources || isAttachmentDownload) {
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










