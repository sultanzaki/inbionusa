/** No password is persisted in drafts, URLs, audit payloads or idempotency records. */
export function bomPasswordError(password: unknown): string | null {
  return typeof password !== "string" ||
    password.trim().length < 16 ||
    new TextEncoder().encode(password).length > 64
    ? "Use a BOM password of at least 16 characters and at most 64 UTF-8 bytes."
    : null;
}
