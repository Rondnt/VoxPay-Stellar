import { NextRequest, NextResponse } from "next/server";

/**
 * El socket se conecta a otro host (Cloud Run), así que el navegador no puede enviarle la cookie
 * HttpOnly de VoxPay. La página obtiene aquí el token de su propia cookie autenticada y lo entrega
 * al handshake de Socket.IO. El API valida de nuevo ese token antes de aceptar la conexión.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("voxpay_session")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "Sesión requerida" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "no-store", Vary: "Cookie" } },
  );
}
