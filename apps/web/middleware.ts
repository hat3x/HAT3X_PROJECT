import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith("/dashboard") || pathname.startsWith("/dashboard/login")) {
    return NextResponse.next()
  }

  const token = process.env["DASHBOARD_TOKEN"]
  const cookie = request.cookies.get("dashboard-session")?.value

  if (token == null || cookie !== token) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/dashboard/login"
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
