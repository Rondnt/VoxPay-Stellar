// Test-only in-memory API. Never imported by the application.
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Keypair } from "@stellar/stellar-sdk";
const address = Keypair.random().publicKey();
let recipients, orders, failAnalytics, confirms;
const hash = "a".repeat(64);
function reset() {
  recipients = [
    { id: "jose", alias: "José", stellarAddress: address },
    { id: "ana", alias: "Ana", stellarAddress: address },
  ];
  orders = [
    {
      id: "order-10",
      merchantId: "merchant-test",
      orderRef: "10",
      amount: "30",
      splitsJson: [{ recipientAlias: "José", amount: 5 }],
      status: "PENDING",
      createTxHash: hash,
      payTxHash: null,
      createdAt: "2026-09-25T15:42:00Z",
    },
    {
      id: "order-09",
      merchantId: "merchant-test",
      orderRef: "09",
      amount: "25",
      splitsJson: [],
      status: "PAID",
      createTxHash: hash,
      payTxHash: hash,
      createdAt: "2026-09-25T15:28:00Z",
    },
    {
      id: "order-08",
      merchantId: "merchant-test",
      orderRef: "08",
      amount: "42",
      splitsJson: [],
      status: "PAID",
      createTxHash: hash,
      payTxHash: hash,
      createdAt: "2026-09-25T15:15:00Z",
    },
    {
      id: "order-07",
      merchantId: "merchant-test",
      orderRef: "07",
      amount: "18",
      splitsJson: [],
      status: "CANCELLED",
      createTxHash: hash,
      payTxHash: null,
      createdAt: "2026-09-25T14:56:00Z",
    },
  ];
  failAnalytics = false;
  confirms = 0;
}
reset();
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost:3101").pathname;
  const send = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  if (path === "/health") return send(200, { ok: true });
  if (path === "/__test/reset") {
    reset();
    return send(200, { address });
  }
  if (path === "/__test/analytics-error") {
    failAnalytics = true;
    return send(200, {});
  }
  if (path === "/__test/counts") return send(200, { confirms });
  if (path === "/__test/pay") {
    orders[0].status = "PAID";
    orders[0].payTxHash = hash;
    io.of("/notifications").emit("event", {
      event: "order:paid",
      payload: { orderId: orders[0].id, hash },
    });
    return send(200, {});
  }
  if (path === "/v1/auth/login") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    return body.email === "negocio@example.com" &&
      body.password === "password123"
      ? send(200, { accessToken: "test-session" })
      : send(401, { message: "Invalid credentials" });
  }
  if (
    !path.startsWith("/v1/public/") &&
    req.headers.authorization !== "Bearer test-session"
  )
    return send(401, { message: "Unauthorized" });
  if (path === "/v1/merchants/me")
    return send(200, {
      id: "merchant-test",
      tenantId: "tenant-test",
      stellarAddress: address,
      operatorAuthorized: true,
    });
  if (path === "/v1/analytics/today")
    return failAnalytics
      ? send(503, { message: "Unavailable" })
      : send(200, {
          totalAmount: "67",
          count: 2,
          from: "2026-09-25T00:00:00Z",
          to: "2026-09-25T15:42:00Z",
        });
  if (path === "/v1/orders") return send(200, orders);
  if (path.startsWith("/v1/orders/") || path.startsWith("/v1/public/orders/")) {
    const order = orders.find((o) => o.id === path.split("/").at(-1));
    return order ? send(200, order) : send(404, { message: "Order not found" });
  }
  if (path === "/v1/voice/commands") {
    for await (const chunk of req) {
      void chunk;
    }
    send(201, { commandId: "voice-test" });
    setTimeout(
      () =>
        io
          .of("/notifications")
          .emit("event", {
            event: "voice:confirmation",
            payload: {
              commandId: "voice-test",
              transcript:
                "Cobra 30 USDC por el pedido 10 y reparte 5 USDC a José",
              intent: {
                intent: "create_order",
                order_ref: "10",
                amount: 30,
                splits: [{ recipient_alias: "José", amount: 5 }],
                confidence: 0.99,
              },
            },
          }),
      250,
    );
    return;
  }
  if (path === "/v1/voice/commands/voice-test/confirm") {
    confirms++;
    send(201, orders[0]);
    setTimeout(
      () =>
        io
          .of("/notifications")
          .emit("event", {
            event: "order:created",
            payload: { orderId: orders[0].id, hash },
          }),
      200,
    );
    return;
  }
  if (path.startsWith("/v1/recipients")) {
    const id = path.split("/")[3];
    if (req.method === "GET") return send(200, recipients);
    if (req.method === "DELETE") {
      recipients = recipients.filter((r) => r.id !== id);
      return send(204);
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (
      recipients.some(
        (r) =>
          r.alias.toLowerCase() === body.alias?.toLowerCase() && r.id !== id,
      )
    )
      return send(409, { message: "Alias already exists" });
    const recipient = { id: id ?? "new-recipient", ...body };
    if (req.method === "PATCH")
      recipients = recipients.map((r) => (r.id === id ? recipient : r));
    else recipients.push(recipient);
    return send(200, recipient);
  }
  send(404, { message: "Not found" });
});
const io = new Server(server, { cors: { origin: "http://localhost:3100" } });
io.of("/notifications").on("connection", () => {});
server.listen(3101, "127.0.0.1");
