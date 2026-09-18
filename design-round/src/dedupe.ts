import { createHash } from "node:crypto";

/** JSON.stringify with object keys sorted recursively, so key order never changes the hash. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function dedupeKey(
  patientId: string,
  notificationType: string,
  payload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(canonicalize([patientId, notificationType, payload]))
    .digest("hex");
}
