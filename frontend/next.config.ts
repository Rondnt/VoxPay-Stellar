import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Permite abrir el dev server desde el celular/otra PC en la misma red (para escanear el QR de
  // pago) sin que Next bloquee sus propios recursos de dev (HMR, etc.) por origen distinto.
  allowedDevOrigins: ["192.168.100.38"],
  turbopack: {
    // Sin esto, Next detecta el package-lock.json de la raíz del repo (start-all.ps1, ajeno a esta
    // app) y lo toma como workspace root -- el build de producción (output: standalone, inyectado
    // por el adapter de Firebase App Hosting) termina anidando un "frontend/" extra adentro de
    // .next/standalone/, y el adapter rompe buscando .next/standalone/.next/routes-manifest.json
    // en vez de .next/standalone/frontend/.next/routes-manifest.json.
    root: path.join(__dirname),
  },
};

export default nextConfig;
