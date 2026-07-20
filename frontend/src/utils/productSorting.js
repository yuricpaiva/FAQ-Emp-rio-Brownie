export function compareProductsByName(left, right) {
  const leftName = String(left?.name || "").trim();
  const rightName = String(right?.name || "").trim();
  if (!leftName && rightName) return 1;
  if (leftName && !rightName) return -1;
  const nameComparison = leftName.localeCompare(
    rightName,
    "pt-BR",
    { sensitivity: "base", numeric: true }
  );
  if (nameComparison) return nameComparison;
  return String(left?.code || "").localeCompare(String(right?.code || ""), "pt-BR", { numeric: true });
}

export function sortProductsByName(products) {
  return [...(products || [])].sort(compareProductsByName);
}
