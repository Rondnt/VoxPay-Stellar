import { io, type Socket } from "socket.io-client";
export interface NotificationEvent {
  event: string;
  payload: unknown;
}
export function connectNotifications(merchantId: string): Socket {
  // Current backend accepts merchantId. It must authenticate rooms before production.
  const base = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  ).replace(/\/$/, "");
  return io(`${base}/notifications`, {
    query: { merchantId },
    autoConnect: false,
    reconnectionAttempts: 8,
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
