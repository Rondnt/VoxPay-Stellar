import type { NextRequest } from "next/server";

// App Hosting forwards the public domain to an internal host. Use the configured
// public origin in production; compare Host directly for local/LAN development.
// Forwarded headers are not trusted as an origin allowlist.
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const supplied = new URL(origin);
    if (origin !== supplied.origin) return false;
    const publicOrigin = process.env.VOXPAY_APP_ORIGIN;
    if (publicOrigin) return supplied.origin === new URL(publicOrigin).origin;
    return supplied.host === host;
  } catch {
    return false;
  }
}
