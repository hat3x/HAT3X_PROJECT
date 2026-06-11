import { NextResponse } from "next/server"

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json() as { password?: string }
  const token = process.env["DASHBOARD_TOKEN"]

  if (token == null || body.password !== token) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set("dashboard-session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  })
  return response
}
