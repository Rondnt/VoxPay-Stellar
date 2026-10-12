import { test, expect, type Page } from "@playwright/test";
import { parseIntent, explorerUrl, money } from "../src/lib/domain";
const base = "http://localhost:3101";

test("removed endpoints and obsolete sessions cannot bypass authentication", async ({
  page,
  context,
  request,
}) => {
  const entry = await request.post("/api/local-preview/session", {
    headers: { Origin: "http://localhost:3100" },
  });
  expect(entry.status()).toBe(404);
  const payment = await request.post(
    "/api/backend/v1/public/orders/order-10/preview-pay",
    { headers: { Origin: "http://localhost:3100" } },
  );
  expect(payment.status()).toBe(404);
  await context.addCookies([
    {
      name: "voxpay_session",
      value: "voxpay-local-preview",
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
  const privateData = await page.request.get("/api/backend/v1/merchants/me");
  expect(privateData.status()).toBe(401);
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Probar frontend en local" }),
  ).toHaveCount(0);

  const payload = Buffer.from(
    JSON.stringify({ iss: "https://securetoken.google.com/preview-test" }),
  ).toString("base64url");
  await context.addCookies([
    {
      name: "voxpay_session",
      value: `header.${payload}.signature`,
      url: "http://localhost:3100",
      httpOnly: true,
    },
  ]);
  const firebaseAccount = await page.request.get(
    "/api/backend/v1/merchants/me",
  );
  expect(firebaseAccount.status()).toBe(401);
});
async function login(page: Page) {
  // Keep merchant flow tests independent of live Firebase/Google accounts.
  // The existing compatibility bridge sets the real HttpOnly session cookie.
  const response = await page.request.post("/api/backend/v1/auth/login", {
    data: { email: "negocio@example.com", password: "password123" },
    headers: { Origin: "http://localhost:3100" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/pos");
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
test("login Voxi plays continuously at 1.25x without sound on desktop and mobile", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  const animation = page.locator(".auth-voxi-video");
  const video = animation.locator("video");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toContain("/brand/v2/voxi-login.mp4");
  await expect(animation).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
  expect(await video.evaluate((element: HTMLVideoElement) => ({
    muted: element.muted,
    volume: element.volume,
    controls: element.controls,
    loop: element.loop,
    playbackRate: element.playbackRate,
  }))).toEqual({ muted: true, volume: 0, controls: false, loop: true, playbackRate: 1.25 });
  const backgroundAlpha = await video.evaluate((element: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(element, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  });
  expect(backgroundAlpha).toBe(255);
  await animation.hover();
  await page.mouse.move(0, 0);
  await page.getByLabel("Correo electrónico").focus();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  const repeats = await video.evaluate((element: HTMLVideoElement) =>
    new Promise<boolean>((resolve) => {
      let previousTime = element.currentTime;
      const timeout = setTimeout(
        () => finish(false),
        (element.duration / element.playbackRate + 1) * 1000,
      );
      const observe = () => {
        if (element.currentTime < previousTime) finish(true);
        previousTime = element.currentTime;
      };
      function finish(repeated: boolean) {
        clearTimeout(timeout);
        element.removeEventListener("timeupdate", observe);
        resolve(repeated);
      }
      element.addEventListener("timeupdate", observe);
    }),
  );
  expect(repeats).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768);
  await page.screenshot({ path: "test-results/login-voxi-desktop.png", animations: "disabled" });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const mobile = await context.newPage();
    await mobile.goto("http://localhost:3100/login");
    const mobileAnimation = mobile.locator(".auth-voxi-video");
    const mobileVideo = mobileAnimation.locator("video");
    await expect.poll(() => mobileVideo.evaluate((element: HTMLVideoElement) => element.currentSrc)).toContain("/brand/v2/voxi-login-mobile.mp4");
    await expect(mobileVideo).toHaveAttribute("poster", "/brand/v2/voxi-login-mobile-poster.png");
    await expect.poll(() => mobileVideo.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
    expect(await mobileVideo.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    expect(await mobileVideo.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(1.25);
    await mobile.getByLabel("Correo electrónico").focus();
    await expect.poll(() => mobileVideo.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
    const mobileCard = await mobile.locator(".login-card").boundingBox();
    const mobileArt = await mobile.locator(".auth-welcome-art").boundingBox();
    expect(Math.abs(mobileArt!.y + mobileArt!.height - mobileCard!.y)).toBeLessThan(1);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await mobile.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
    await mobile.screenshot({ path: "test-results/login-voxi-mobile.png", animations: "disabled" });
    await mobile.setViewportSize({ width: 1024, height: 900 });
    await expect.poll(() => mobileVideo.evaluate((element: HTMLVideoElement) => element.currentSrc)).toContain("/brand/v2/voxi-login.mp4");
    await expect(mobileVideo).toHaveAttribute("poster", "/brand/v2/voxi-login-blue-poster.png");
    await expect.poll(() => mobileVideo.evaluate((element: HTMLVideoElement) => !element.paused && element.playbackRate === 1.25)).toBe(true);
    await mobile.goto("http://localhost:3100/register");
    await expect(mobile.locator(".auth-voxi-video")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
test("login validates, stores HttpOnly session and logout protects merchant routes", async ({
  page,
  context,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.evaluate(() => document.fonts.ready);
  const loginCard = await page.locator(".login-card").boundingBox();
  const authShell = await page.locator(".auth-shell").boundingBox();
  const welcome = await page.locator(".auth-welcome").boundingBox();
  expect(loginCard).not.toBeNull();
  expect(authShell).not.toBeNull();
  expect(welcome).not.toBeNull();
  expect(Math.abs(authShell!.y + authShell!.height / 2 - 512)).toBeLessThan(8);
  expect(
    Math.abs(loginCard!.y + loginCard!.height / 2 - (welcome!.y + welcome!.height / 2)),
  ).toBeLessThan(8);
  await page.screenshot({
    path: "test-results/login-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page.getByText("Ingresa un correo válido.")).toBeVisible();
  await page.route(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**",
    (route) =>
      route.fulfill({
        status: 400,
        json: {
          error: {
            code: 400,
            message: "INVALID_LOGIN_CREDENTIALS",
            errors: [
              {
                message: "INVALID_LOGIN_CREDENTIALS",
                domain: "global",
                reason: "invalid",
              },
            ],
          },
        },
      }),
  );
  await page.getByLabel("Correo electrónico").fill("wrong@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrect123");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await expect(
    page.getByRole("button", { name: "Iniciar sesión con Google" }),
  ).toBeVisible();
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
test("dashboard rejects invalid responses, retries zero totals and preserves valid metrics", async ({
  page,
}) => {
  await login(page);
  let response = {
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><html><body>Another application</body></html>",
  };
  await page.route("**/api/backend/v1/analytics/today", (route) =>
    route.fulfill(response),
  );
  const invalidResponses = [
    response,
    { status: 200, contentType: "application/json", body: "" },
    { status: 200, contentType: "application/json", body: "null" },
    { status: 204, contentType: "application/json", body: "" },
    {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totalAmount: "invalid", count: 2 }),
    },
  ];
  for (const invalid of invalidResponses) {
    response = invalid;
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "No pudimos cargar el resumen" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Actualizar" })).toBeVisible();
    await expect(page.getByText("Total cobrado hoy", { exact: true })).toHaveCount(0);
  }

  response = {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      totalAmount: "0",
      count: 0,
      from: "2026-10-09T00:00:00Z",
      to: "2026-10-09T12:00:00Z",
    }),
  };
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(page.getByText("0.00 USDC", { exact: true })).toBeVisible();
  await expect(
    page.locator(".metric").filter({ hasText: "Pedidos pagados" }).locator("strong"),
  ).toHaveText("0");
  await expect(page.getByText("Aún no hay pagos confirmados hoy")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No pudimos cargar el resumen" }),
  ).toHaveCount(0);

  response.body = "{}";
  await page.getByRole("button", { name: "Actualizar" }).click();
  await expect(
    page.getByText("Mostramos el último resumen disponible.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("0.00 USDC", { exact: true })).toBeVisible();
});
test("voice records, confirms once, generates real payment URL QR and receives paid event", async ({
  page,
  request,
}) => {
  await login(page);
  const record = page.getByRole("button", {
    name: "Grabar instrucción",
    exact: true,
  });
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
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 956 });
    for (const path of [
      "/pos",
      "/orders",
      "/dashboard",
      "/recipients",
      "/wallet",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        path + " at " + width + "px",
      ).toBe(true);
    }
  }
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

test("mobile voice review can edit and rerecord without creating a charge", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Ejemplos", exact: true }).click();
  await expect(page.locator("#voice-examples")).toBeVisible();
  await page
    .getByRole("button", { name: "Grabar instrucción", exact: true })
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Detener y transcribir" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar cobro" }),
  ).toBeEnabled();
  await expect(page.locator(".voice-card")).toBeHidden();
  await expect(
    page.locator(".review-mobile-voxi [data-voxi-pose='presenting']"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar instrucción" }).click();
  await expect(page.locator(".voice-card")).toBeVisible();
  await page
    .getByRole("button", { name: "Grabar instrucción", exact: true })
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Detener y transcribir" }).click();
  await expect(page.locator(".voice-card")).toBeHidden();
  expect(
    (await (await request.get(base + "/__test/counts")).json()).confirms,
  ).toBe(0);
  await page.screenshot({
    path: "test-results/pos-review-mobile.png",
    fullPage: true,
  });
});

test("registration and recovery keep their real forms and fit small screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/register");
  await expect(
    page.getByRole("button", { name: "Iniciar sesión con Google" }),
  ).toBeVisible();
  await page.getByLabel("Correo electrónico").fill("negocio@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("password123");
  await page.getByLabel("Confirmar contraseña").fill("different123");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Enviar instrucciones" }).click();
  await expect(page.getByText("Ingresa un correo válido.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("frontend bridge forwards the existing merchant wallet registration contract", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.patch("/api/backend/v1/merchants/wallet", {
        headers: { Origin: "http://localhost:3100" },
        data: { stellarAddress: "G" },
      })
    ).status(),
  ).toBe(401);
  await login(page);
  const { address } = await (await request.get(base + "/__test/reset")).json();
  const response = await page.request.patch(
    "/api/backend/v1/merchants/wallet",
    {
      headers: { Origin: "http://localhost:3100" },
      data: { stellarAddress: address },
    },
  );
  expect(response.ok()).toBe(true);
  expect((await response.json()).stellarAddress).toBe(address);
  const counts = await (await request.get(base + "/__test/counts")).json();
  expect(counts.walletAttempts).toEqual([{ method: "PATCH", stellarAddress: address }]);
  expect(counts.walletRegistrations).toBe(1);
});

test("wallet registration supports the published POST API without bypassing authentication or origin checks", async ({
  page,
  request,
}) => {
  const { address } = await (await request.get(base + "/__test/reset")).json();
  await request.post(base + "/__test/wallet-config", { data: { method: "POST" } });
  const path = "/api/backend/v1/merchants/wallet";
  expect((await request.patch(path, {
    headers: { Origin: "http://localhost:3100" },
    data: { stellarAddress: address },
  })).status()).toBe(401);
  await login(page);
  expect((await page.request.patch(path, {
    headers: { Origin: "https://other.example" },
    data: { stellarAddress: address },
  })).status()).toBe(403);
  expect((await (await request.get(base + "/__test/counts")).json()).walletAttempts).toEqual([]);
  const response = await page.request.patch(path, {
    headers: { Origin: "http://localhost:3100" },
    data: { stellarAddress: address },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).stellarAddress).toBe(address);
  const counts = await (await request.get(base + "/__test/counts")).json();
  expect(counts.walletAttempts).toEqual([
    { method: "PATCH", stellarAddress: address },
    { method: "POST", stellarAddress: address },
  ]);
  expect(counts.walletRegistrations).toBe(1);
});

test("wallet registration never retries validation, authorization, missing merchant or server failures", async ({
  page,
  request,
}) => {
  const { address } = await (await request.get(base + "/__test/reset")).json();
  await login(page);
  for (const failure of [
    { status: 400, message: "Invalid Stellar address" },
    { status: 403, message: "Withdraw the reserve before changing wallets" },
    { status: 404, message: "Merchant not found" },
    { status: 409, message: "Wallet already linked" },
    { status: 500, message: "Internal server error" },
  ]) {
    await request.post(base + "/__test/wallet-config", { data: { failure } });
    const response = await page.request.patch("/api/backend/v1/merchants/wallet", {
      headers: { Origin: "http://localhost:3100" },
      data: { stellarAddress: address },
    });
    expect(response.status()).toBe(failure.status);
    expect((await response.json()).message.message).toBe(failure.message);
    const counts = await (await request.get(base + "/__test/counts")).json();
    expect(counts.walletAttempts).toEqual([{ method: "PATCH", stellarAddress: address }]);
    expect(counts.walletRegistrations).toBe(0);
  }
});

test("nested API errors show the actual reason and preserve the form", async ({ page, request }) => {
  const { address } = await (await request.get(base + "/__test/reset")).json();
  await login(page);
  await page.goto("/recipients");
  await page.getByRole("button", { name: "Agregar destinatario" }).click();
  await page.getByLabel("Alias", { exact: true }).fill("Pedro");
  await page.getByLabel("Dirección pública de Stellar").fill(address);
  const cases = [
    {
      body: { statusCode: 400, message: { message: "La wallet no está disponible.", error: "Bad Request" } },
      expected: "La wallet no está disponible.",
    },
    {
      body: { message: { message: ["Revisa el alias", "Revisa la dirección"] } },
      expected: "Revisa el alias. Revisa la dirección",
    },
    { body: { message: "Revisa los datos." }, expected: "Revisa los datos." },
    { body: { message: { error: "Bad Request" } }, expected: "No se pudo completar la solicitud." },
  ];
  let current = cases[0];
  await page.route("**/api/backend/v1/recipients", (route) =>
    route.fulfill({ status: 400, json: current.body }),
  );
  for (const scenario of cases) {
    current = scenario;
    await page.getByRole("button", { name: "Guardar destinatario" }).click();
    await expect(page.getByText(scenario.expected, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Alias", { exact: true })).toHaveValue("Pedro");
    await expect(page.getByLabel("Dirección pública de Stellar")).toHaveValue(address);
  }
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
  const record = page.getByRole("button", {
    name: "Grabar instrucción",
    exact: true,
  });
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
  const record = page.getByRole("button", {
    name: "Grabar instrucción",
    exact: true,
  });
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
