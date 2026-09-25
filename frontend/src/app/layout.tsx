import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "VoxPay", template: "%s · VoxPay" },
  description: "POS inteligente por voz sobre Stellar",
  manifest: "/manifest.json",
  icons: { icon: "/brand/463ac.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
