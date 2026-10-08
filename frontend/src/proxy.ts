import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 16 renombró `middleware.ts` a `proxy.ts` (mismo propósito, mismo runtime).
export function proxy(request: NextRequest) {
  const token = request.cookies.get("voxpay_session")?.value;

  // Discard the obsolete session from the previous development-only version.
  if (!token || token === "voxpay-local-preview") {
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    if (token === "voxpay-local-preview")
      response.cookies.delete("voxpay_session");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/pos/:path*",
    "/orders/:path*",
    "/recipients/:path*",
    "/dashboard/:path*",
    "/wallet/:path*",
  ],
};
