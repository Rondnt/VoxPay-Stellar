import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-server";
import { isSameOriginRequest } from "@/lib/same-origin";
import { responseErrorMessage } from "@/lib/api-error";

// ─── Helpers para tokens Firebase ─────────────────────────────────────────
/** Firebase ID tokens son JWTs firmados por Google (RS256, iss = securetoken.google.com) */
function isFirebaseToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64").toString("utf8"),
    );
    return (
      typeof payload.iss === "string" &&
      payload.iss.startsWith("https://securetoken.google.com/")
    );
  } catch {
    return false;
  }
}

const routes: Record<string, RegExp[]> = {
  GET: [
    /^v1\/merchants\/me$/,
    /^v1\/merchants\/reserve\/balance$/,
    /^v1\/merchants\/reserve\/withdrawals$/,
    /^v1\/recipients$/,
    /^v1\/orders(?:\/[\w-]+)?$/,
    /^v1\/public\/orders\/[\w-]+$/,
    /^v1\/analytics\/today$/,
  ],
  POST: [
    /^v1\/auth\/(login|logout)$/,
    /^v1\/recipients$/,
    /^v1\/voice\/commands(?:\/[\w-]+\/confirm)?$/,
    /^v1\/merchants\/operator\/(tx|submit)$/,
    /^v1\/merchants\/reserve\/withdraw\/(tx|submit)$/,
    /^v1\/public\/orders\/[\w-]+\/(tx|submit)$/,
  ],
  PATCH: [/^v1\/recipients\/[\w-]+$/, /^v1\/merchants\/wallet$/, /^v1\/merchants\/reserve$/],
  DELETE: [/^v1\/recipients\/[\w-]+$/],
};
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const method = request.method;
  if (!routes[method]?.some((pattern) => pattern.test(path)))
    return NextResponse.json(
      { message: "Ruta no disponible" },
      { status: 404 },
    );
  if (method !== "GET" && !isSameOriginRequest(request))
    return NextResponse.json(
      { message: "Origen no permitido" },
      { status: 403 },
    );
  const isLogin = path === "v1/auth/login";
  const isPublic = path.startsWith("v1/public/") || isLogin;
  const token = request.cookies.get("voxpay_session")?.value;

  // ── Logout: borrar cookie independientemente del tipo de token ────────────
  if (path === "v1/auth/logout") {
    const response = new NextResponse(null, { status: 204 });
    response.cookies.delete("voxpay_session");
    return response;
  }
  if (!isPublic && !token)
    return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });

  if (!isPublic && token === "voxpay-local-preview") {
    const response = NextResponse.json(
      { message: "Tu sesión venció. Vuelve a iniciar sesión." },
      { status: 401 },
    );
    response.cookies.delete("voxpay_session");
    return response;
  }
  const firebaseSession = !isPublic && !!token && isFirebaseToken(token);
  if (firebaseSession && token) {
    try {
      await verifyFirebaseToken(token);
    } catch {
      const response = NextResponse.json(
        { message: "Tu sesión venció. Vuelve a iniciar sesión." },
        { status: 401 },
      );
      response.cookies.delete("voxpay_session");
      return response;
    }
  }
  const maxBodyBytes = 13 * 1024 * 1024; // 12 MB audio plus multipart headers.
  if (Number(request.headers.get("content-length")) > maxBodyBytes)
    return NextResponse.json(
      { message: "La solicitud excede el tamaño permitido" },
      { status: 413 },
    );
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (!isPublic && token)
    headers.set("Authorization", `Bearer ${token}`);
  try {
    const body = method === "GET" ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > maxBodyBytes)
      return NextResponse.json(
        { message: "La solicitud excede el tamaño permitido" },
        { status: 413 },
      );
    const base = (
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001"
    ).replace(/\/$/, "");
    const signal = AbortSignal.timeout(40_000);
    const forward = (upstreamMethod: string) =>
      fetch(`${base}/${path}`, {
        method: upstreamMethod,
        headers,
        body,
        cache: "no-store",
        redirect: "error",
        signal,
      });
    let upstream = await forward(method);
    let text = await upstream.text();
    // The published API uses POST; the repository's newer API uses PATCH.
    // Only retry when PATCH has no handler, never after a wallet operation fails.
    if (
      path === "v1/merchants/wallet" &&
      method === "PATCH" &&
      upstream.status === 404
    ) {
      let errorBody: unknown;
      try {
        errorBody = JSON.parse(text);
      } catch {
        errorBody = undefined;
      }
      if (
        responseErrorMessage(errorBody) ===
        "Cannot PATCH /v1/merchants/wallet"
      ) {
        upstream = await forward("POST");
        text = await upstream.text();
      }
    }
    if (firebaseSession && upstream.status === 401) {
      return NextResponse.json(
        {
          code: "FIREBASE_BACKEND_NOT_LINKED",
          message:
            "Tu cuenta está autenticada con Firebase. Falta vincularla a un negocio en la API de VoxPay.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (isLogin && upstream.ok) {
      const data = JSON.parse(text) as { accessToken?: string };
      if (!data.accessToken) throw new Error("Invalid login response");
      const response = NextResponse.json({ authenticated: true });
      response.cookies.set("voxpay_session", data.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    const response = new NextResponse(upstream.status === 204 ? null : text, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
    if (upstream.status === 401 && !isPublic)
      response.cookies.delete("voxpay_session");
    return response;
  } catch {
    if (firebaseSession)
      return NextResponse.json(
        {
          message:
            "Has iniciado sesión con Firebase. La API de VoxPay todavía no está disponible para cargar tu negocio.",
        },
        { status: 424 },
      );
    return NextResponse.json(
      { message: "No se pudo contactar a la API de VoxPay" },
      { status: 502 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
