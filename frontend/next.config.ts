import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Permite abrir el dev server desde el celular/otra PC en la misma red (para escanear el QR de
  // pago) sin que Next bloquee sus propios recursos de dev (HMR, etc.) por origen distinto.
  allowedDevOrigins: ["192.168.100.38"],
};

export default nextConfig;
