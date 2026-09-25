import "server-only";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export async function verifyFirebaseToken(token: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase no está configurado.");
  const app =
    getApps().find((app) => app.name === "voxpay-auth") ??
    initializeApp({ projectId }, "voxpay-auth");
  // Signature, issuer, audience and expiration are verified with Google's public keys.
  // Revocation checks require separate server credentials and are not enabled here.
  return getAuth(app).verifyIdToken(token);
}
