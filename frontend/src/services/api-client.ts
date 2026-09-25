export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/backend${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(45_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "No pudimos conectar con el servidor. Revisa tu conexión.",
    );
  }
  const body = await response.text();
  let data: unknown;
  try {
    data = body ? JSON.parse(body) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.includes("/auth/login") &&
      !path.includes("/public/") &&
      typeof window !== "undefined" &&
      !window.location.pathname.includes("/login")
    )
      window.location.replace("/login?expired=1");
    const message =
      data && typeof data === "object" && "message" in data
        ? (data as { message: unknown }).message
        : undefined;
    throw new ApiError(
      response.status,
      Array.isArray(message)
        ? message.join(". ")
        : typeof message === "string"
          ? message
          : "No se pudo completar la solicitud.",
    );
  }
  return data as T;
}
export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Tu sesión venció. Vuelve a iniciar sesión.";
    if (error.status === 409)
      return "Este alias o pedido ya existe. Revisa los datos antes de continuar.";
    if (error.status >= 500)
      return "El servicio no está disponible. Inténtalo de nuevo en unos momentos.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
}
