// Firebase configuration for VoxPay-Stellar
import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Evitar inicializar múltiples veces (importante en Next.js con HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Desarrollo local: sin proyecto real de Firebase, `auth` apunta al Auth Emulator (ver
// `firebase.json` y `backend/.env` FIREBASE_PROJECT_ID, mismo patrón para Firestore).
// `auth.emulatorConfig` evita reconectar en cada re-render por HMR (`connectAuthEmulator` tira si
// se llama dos veces sobre la misma instancia).
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
if (emulatorHost && !auth.emulatorConfig) {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
}

export default app;
