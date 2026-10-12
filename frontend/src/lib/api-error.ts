export function responseErrorMessage(value: unknown): string | undefined {
  // Nest wraps HttpException responses in message, which can itself be an object.
  for (let depth = 0; depth < 5; depth++) {
    if (typeof value === "string") return value.trim() || undefined;
    if (Array.isArray(value)) {
      const messages = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      return messages.length ? messages.join(". ") : undefined;
    }
    if (!value || typeof value !== "object" || !("message" in value))
      return undefined;
    value = value.message;
  }
  return undefined;
}
