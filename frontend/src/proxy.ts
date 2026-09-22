import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renombró `middleware.ts` a `proxy.ts` (mismo propósito, mismo runtime).
export function proxy(request: NextRequest) {
  const token = request.cookies.get("voxpay_session")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pos/:path*", "/orders/:path*", "/recipients/:path*", "/dashboard/:path*"],
};
