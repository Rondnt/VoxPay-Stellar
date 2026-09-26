import type { NextRequest } from "next/server";

/**
 * `request.nextUrl.origin` no refleja el host real de la conexión en el dev server de Next —
 * siempre resuelve a "localhost" aunque se entre por otra IP (LAN, para probar desde el celular),
 * lo que hace que cualquier chequeo de same-origin contra ese valor falle en falso. Comparamos el
 * header `Origin` contra el header `Host` real de la request en su lugar.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
