/** Only permit same-site paths after authentication, including browser URL normalization. */
export function safeNextPath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return undefined;
  try {
    const url = new URL(value, "https://polyhistor.invalid");
    return url.origin === "https://polyhistor.invalid" ? url.pathname + url.search + url.hash : undefined;
  } catch {
    return undefined;
  }
}
