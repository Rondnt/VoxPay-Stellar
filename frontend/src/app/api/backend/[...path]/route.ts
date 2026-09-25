import { NextRequest, NextResponse } from "next/server";
const routes: Record<string, RegExp[]> = {
  GET: [
    /^v1\/merchants\/me$/,
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
    /^v1\/public\/orders\/[\w-]+\/(tx|submit)$/,
  ],
  PATCH: [/^v1\/recipients\/[\w-]+$/],
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
  if (
    method !== "GET" &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json(
      { message: "Origen no permitido" },
      { status: 403 },
    );
  const isLogin = path === "v1/auth/login";
  const isPublic = path.startsWith("v1/public/") || isLogin;
  const token = request.cookies.get("voxpay_session")?.value;
  if (path === "v1/auth/logout") {
    const response = new NextResponse(null, { status: 204 });
    response.cookies.delete("voxpay_session");
    return response;
  }
  if (!isPublic && !token)
    return NextResponse.json({ message: "Sesión requerida" }, { status: 401 });
  const maxBodyBytes = 13 * 1024 * 1024; // 12 MB audio plus multipart headers.
  if (Number(request.headers.get("content-length")) > maxBodyBytes)
    return NextResponse.json(
      { message: "La solicitud excede el tamaño permitido" },
      { status: 413 },
    );
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  if (!isPublic && token) headers.set("Authorization", `Bearer ${token}`);
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
    const upstream = await fetch(`${base}/${path}`, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(40_000),
    });
    const text = await upstream.text();
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
    return NextResponse.json(
      { message: "No se pudo contactar a la API de VoxPay" },
      { status: 502 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
