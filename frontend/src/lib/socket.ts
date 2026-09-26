import { io, type Socket } from "socket.io-client";
import { auth } from "./firebase";
export interface NotificationEvent {
  event: string;
  payload: unknown;
}
export function connectNotifications(merchantId: string): Socket {
  const base = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  return io(`${base}/notifications`, {
    query: { merchantId },
    autoConnect: false,
    reconnectionAttempts: 8,
    // Función en vez de un token fijo: socket.io-client la vuelve a invocar en cada intento de
    // reconexión, así el token nunca queda vencido (el SDK de Firebase cachea y refresca solo
    // `getIdToken()`). El backend lo valida en `NotificationsGateway.handleConnection`.
    auth: async (cb) => {
      const token = await auth.currentUser?.getIdToken();
      cb({ token });
    },
  });
}
export function onEvent(
  socket: Socket,
  handler: (event: string, payload: unknown) => void,
) {
  const listener = (message: NotificationEvent) => {
    if (message && typeof message.event === "string")
      handler(message.event, message.payload);
  };
  socket.on("event", listener);
  return () => {
    socket.off("event", listener);
  };
}
