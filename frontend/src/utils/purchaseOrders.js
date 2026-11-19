export function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function normalizeCnpj(value) {
  return String(value || "").replace(/\D/g, "");
}

export function formatCnpj(value) {
  const digits = normalizeCnpj(value);
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : String(value || "");
}

export function isValidCnpj(value) {
  const digits = normalizeCnpj(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (length) => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

export function normalizeDecimal(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return `${BigInt(whole)}${fraction ? `.${fraction.replace(/0+$/, "")}` : ""}`.replace(/\.$/, "");
}

export function parseMoneyToCents(value) {
  const normalized = normalizeDecimal(value);
  if (normalized === null) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const padded = `${fraction}000`.slice(0, 3);
  let cents = BigInt(whole) * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1n;
  return Number(cents);
}

export function calculateSubtotalCents(quantity, unitPriceCents) {
  const normalized = normalizeDecimal(quantity);
  if (normalized === null || !Number.isInteger(unitPriceCents)) return 0;
  const [whole, fraction = ""] = normalized.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(`${whole}${fraction}`);
  const numerator = units * BigInt(unitPriceCents);
  return Number((numerator + scale / 2n) / scale);
}

export const formatCurrency = (cents) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
export const formatQuantity = (value) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(Number(value) || 0);
export const formatDate = (value, withTime = false) => new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(value));
export const PAYMENT_METHOD_LABELS = { BOLETO: "Boleto", PIX: "PIX", CARTAO: "Cartão" };
export const formatPaymentMethod = (value) => PAYMENT_METHOD_LABELS[value] || "Não informado";

export function monthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function calculateTotals(items = [], additions = []) {
  const productSubtotalCents = items.reduce((sum, item) => sum + Number(item.subtotalCents || 0), 0);
  const additionsTotalCents = additions.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  return { productSubtotalCents, additionsTotalCents, totalCents: productSubtotalCents + additionsTotalCents };
}

export function filterPurchaseOrders(orders, filters = {}) {
  const number = normalizeSearch(filters.number);
  return orders.filter((order) => {
    if (filters.month && monthKey(new Date(order.createdAt)) !== filters.month) return false;
    if (filters.supplierId && order.supplier.id !== filters.supplierId) return false;
    if (filters.buyerId && String(order.buyer.id) !== String(filters.buyerId)) return false;
    if (filters.productId && !(order.items || []).some((item) => item.productId === filters.productId)) return false;
    if (number && !normalizeSearch(order.number).includes(number)) return false;
    return true;
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function validatePurchaseDraft({ supplier, items = [], additions = [], paymentMethod = "", paid = false }) {
  const errors = {};
  if (!supplier) errors.supplier = "Selecione um fornecedor.";
  if (!PAYMENT_METHOD_LABELS[paymentMethod]) errors.paymentMethod = `Selecione a forma de pagamento ${paid ? "utilizada" : "prevista"}.`;
  if (!items.length) errors.items = "Adicione pelo menos um produto.";
  items.forEach((item, index) => {
    if (item.productSource === "MANUAL" && !item.description?.trim()) errors[`item-${index}-description`] = "Informe a descrição do produto avulso.";
    if (item.productSource === "MANUAL" && !item.supplierUnit?.label?.trim()) errors[`item-${index}-unit`] = "Informe a unidade do produto avulso.";
    if (!normalizeDecimal(item.quantity) || Number(item.quantity) <= 0) errors[`item-${index}-quantity`] = "Informe uma quantidade maior que zero.";
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents <= 0) errors[`item-${index}-price`] = "Informe um valor maior que zero.";
  });
  additions.forEach((addition, index) => {
    const hasDescription = Boolean(addition.description?.trim());
    const hasValue = Number(addition.amountCents) > 0;
    const hasRawValue = Boolean(String(addition.amountInput ?? "").trim());
    if ((hasDescription || hasRawValue) && (!hasDescription || !hasValue)) errors[`addition-${index}`] = "Preencha a descrição e um valor maior que zero.";
  });
  return errors;
}
