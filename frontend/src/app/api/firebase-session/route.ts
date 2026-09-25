import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-server";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { message: "Origen no permitido" },
      { status: 403 },
    );
  }
  try {
    const { idToken } = await request.json();
    if (typeof idToken !== "string" || idToken.length > 8192) {
      return NextResponse.json({ message: "Token inválido" }, { status: 400 });
    }
    const identity = await verifyFirebaseToken(idToken);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set("voxpay_session", idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, identity.exp - Math.floor(Date.now() / 1000)),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json(
      { message: "No se pudo verificar la sesión de Firebase." },
      { status: 401 },
    );
  }
}
