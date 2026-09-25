import { test, expect, type Page } from "@playwright/test";
import { parseIntent, explorerUrl, money } from "../src/lib/domain";
const base = "http://localhost:3101";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("negocio@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("password123");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByText("Wallet configurada")).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.get(base + "/__test/reset");
});
test("intent validation rejects unsafe or unknown splits", () => {
  expect(
    parseIntent({
      intent: "create_order",
      order_ref: "10",
      amount: 30,
      confidence: 0.99,
      splits: [{ recipient_alias: "José", amount: 5 }],
    }),
  ).toEqual({
    orderRef: "10",
    amount: 30,
    splits: [{ recipientAlias: "José", amount: 5 }],
  });
  expect(
    parseIntent({
      intent: "create_order",
      orderRef: "10",
      amount: 30,
      splits: [{ recipientAlias: "José", amount: 35 }],
    }),
  ).toBeNull();
  expect(parseIntent({ intent: "unknown", amount: 30 })).toBeNull();
  expect(
    parseIntent({
      intent: "create_order",
      orderRef: "10",
      amount: 30,
      confidence: 0.1,
    }),
  ).toBeNull();
  expect(explorerUrl("javascript:alert(1)")).toBeNull();
  expect(money("30")).toBe("30.00");
});
test("login validates, stores HttpOnly session and logout protects merchant routes", async ({
  page,
  context,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page.getByText("Ingresa un correo válido.")).toBeVisible();
  await page.getByLabel("Correo electrónico").fill("wrong@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrect123");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByText("El correo o la contraseña no son correctos."),
  ).toBeVisible();
  await login(page);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "voxpay_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "test-session",
  );
  await page.getByRole("button", { name: "MN Mi negocio" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/login/);
});
test("recipient CRUD, invalid address, preserved errors and 204 deletion", async ({
  page,
  request,
}) => {
  const { address } = await (await request.get(base + "/__test/reset")).json();
  await login(page);
  await page.goto("/recipients");
  await page.getByRole("button", { name: "Agregar destinatario" }).click();
  await page.getByLabel("Alias", { exact: true }).fill("Pedro");
  await page.getByLabel("Dirección pública de Stellar").fill("G123");
  await page.getByRole("button", { name: "Guardar destinatario" }).click();
  await expect(
    page.getByText("Ingresa una dirección pública de Stellar válida (G…)."),
  ).toBeVisible();
  await page.getByLabel("Dirección pública de Stellar").fill(address);
  await page.getByRole("button", { name: "Guardar destinatario" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedro", exact: true }),
  ).toBeVisible();
  const card = page
    .locator(".recipient-card")
    .filter({ has: page.getByRole("heading", { name: "Pedro", exact: true }) });
  await card.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Alias", { exact: true }).fill("Pedro Lima");
  await page.getByRole("button", { name: "Guardar destinatario" }).click();
  await page
    .locator(".recipient-card")
    .filter({ hasText: "Pedro Lima" })
    .getByRole("button", { name: "Eliminar" })
    .click();
  await expect(
    page.getByRole("heading", { name: "¿Eliminar a Pedro Lima?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar destinatario", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pedro Lima", exact: true }),
  ).toHaveCount(0);
});
test("orders filters, detail, dashboard stale data and desktop design", async ({
  page,
}) => {
  await login(page);
  await page.goto("/orders");
  await expect(page.getByRole("row")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/orders-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Filtrar por estado").selectOption("PAID");
  await expect(page.getByRole("row")).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Buscar por número de pedido" })
    .fill("none");
  await expect(
    page.getByRole("heading", { name: "No encontramos pedidos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.getByRole("link", { name: "Ver detalle" }).first().click();
  await expect(page.getByRole("heading", { name: "Pedido 10" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("67.00 USDC", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.route("**/api/backend/v1/analytics/today", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(
    page.getByText("Mostramos el último resumen disponible.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("67.00 USDC", { exact: true })).toBeVisible();
});
test("voice records, confirms once, generates real payment URL QR and receives paid event", async ({
  page,
  request,
}) => {
  await login(page);
  const record = page
    .getByRole("button", { name: "Grabar instrucción", exact: true })
    .last();
  await expect(record).toBeEnabled();
  await record.click();
  await expect(
    page.getByRole("button", { name: "Detener y transcribir" }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Detener y transcribir" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar cobro" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/pos-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(
    page.getByRole("heading", { name: "Escanea para pagar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir enlace de pago" }),
  ).toHaveAttribute("href", "http://localhost:3100/pay/order-10");
  expect(
    (await (await request.get(base + "/__test/counts")).json()).confirms,
  ).toBe(1);
  await request.get(base + "/__test/pay");
  await expect(
    page.getByRole("heading", { name: "¡Pago recibido!" }),
  ).toBeVisible();
});
test("public payment without session, cancelled and missing orders", async ({
  page,
}) => {
  await page.goto("/pay/order-10");
  await expect(
    page.getByRole("heading", { name: "Paga tu pedido" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conectar wallet", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/payment-desktop.png",
    fullPage: true,
  });
  await page.goto("/pay/order-07");
  await expect(
    page.getByRole("heading", { name: "Pedido cancelado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conectar wallet", exact: true }),
  ).toHaveCount(0);
  await page.goto("/pay/missing");
  await expect(
    page.getByRole("heading", { name: "Pedido no disponible" }),
  ).toBeVisible();
});
test("mobile navigation, every screen fits and brand assets load", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 956 });
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "test-results/login-mobile.png",
    fullPage: true,
  });
  await login(page);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page
    .getByRole("navigation", { name: "Navegación móvil" })
    .getByRole("link", { name: "Pedidos", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Navegación móvil" }),
  ).toHaveCount(0);
  for (const path of [
    "/orders",
    "/dashboard",
    "/recipients",
    "/wallet",
    "/pos?order=order-10",
    "/pay/order-10",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/mobile-${path.split("?")[0].replaceAll("/", "-")}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/pay/order-10");
  await expect(
    page.getByRole("heading", { name: "Paga tu pedido" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("API bridge blocks anonymous merchant access and cross-origin writes", async ({
  request,
}) => {
  expect((await request.get("/api/backend/v1/recipients")).status()).toBe(401);
  expect(
    (
      await request.post("/api/backend/v1/auth/login", {
        data: { email: "negocio@example.com", password: "password123" },
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/backend/health")).status()).toBe(404);
});

test("microphone denial is recoverable and never creates an order", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await login(page);
  const record = page
    .getByRole("button", { name: "Grabar instrucción", exact: true })
    .last();
  await expect(record).toBeEnabled();
  await record.click();
  await expect(
    page.getByText("Micrófono bloqueado.", { exact: false }),
  ).toBeVisible();
  await expect(record).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Confirmar cobro" }),
  ).toBeDisabled();
  expect(
    (await (await request.get(base + "/__test/counts")).json()).confirms,
  ).toBe(0);
});

test("uncertain voice confirmation does not offer automatic resubmission", async ({
  page,
}) => {
  await login(page);
  const record = page
    .getByRole("button", { name: "Grabar instrucción", exact: true })
    .last();
  await expect(record).toBeEnabled();
  await record.click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Detener y transcribir" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar cobro" }),
  ).toBeEnabled();
  let attempts = 0;
  await page.route("**/api/backend/v1/voice/commands/*/confirm", (route) => {
    attempts++;
    return route.fulfill({ status: 502, json: { message: "Lost response" } });
  });
  await page.getByRole("button", { name: "Confirmar cobro" }).click();
  await expect(
    page.getByRole("heading", { name: "Verifica el cobro" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar cobro" }),
  ).toHaveCount(0);
  expect(attempts).toBe(1);
});

test("wallet chooser loads in the browser without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pay/order-10");
  await page
    .getByRole("button", { name: "Conectar wallet", exact: true })
    .click();
  await expect(
    page.getByText("Freighter", { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("missing list and analytics endpoints are explicit, not demo data", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/backend/v1/orders", (route) =>
    route.fulfill({ status: 404, json: { message: "Not found" } }),
  );
  await page.goto("/orders");
  await expect(
    page.getByText(
      "El listado de pedidos todavía no está disponible en la API.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.route("**/api/backend/v1/analytics/today", (route) =>
    route.fulfill({ status: 404, json: { message: "Not found" } }),
  );
  await page.goto("/dashboard");
  await expect(
    page.getByText(
      "Las métricas del día todavía no están disponibles en la API.",
    ),
  ).toBeVisible();
});
