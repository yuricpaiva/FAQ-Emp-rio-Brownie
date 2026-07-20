export function normalizeDecimalInput(value, { allowPercent = false } = {}) {
  let normalized = String(value ?? "");
  if (allowPercent && normalized.endsWith("%")) normalized = normalized.slice(0, -1);
  normalized = normalized.replace(",", ".");
  if (normalized.startsWith(".")) normalized = `0${normalized}`;
  if (normalized === "" || /^\d+(?:\.\d{0,4})?$/.test(normalized)) return normalized;
  return null;
}
