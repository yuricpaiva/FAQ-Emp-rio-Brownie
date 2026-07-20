import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { normalizeDecimalInput } from "../utils/decimalInput";
import { compareProductsByName, sortProductsByName } from "../utils/productSorting";

const today = new Date().toISOString().slice(0, 10);
const calendarWeekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
const initialDefaultIncreasePercent = "";
const consolidatedTab = "consolidado";
const fixedNature = "VENDA NACIONAL";
const orderNature = "ENCOMENDA - CUPOM FISCAL";
const stockSourceLabels = {
  everest: "Estoque Everest",
  faq: "Último estoque do FAQ",
  spreadsheet: "Estoque importado",
};

let xlsxLibraryPromise;

function loadXlsxLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);

  if (!xlsxLibraryPromise) {
    xlsxLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/xlsx.full.min.js";
      script.async = true;
      script.onload = () => window.XLSX
        ? resolve(window.XLSX)
        : reject(new Error("Biblioteca de planilhas indisponível."));
      script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca de planilhas."));
      document.body.appendChild(script);
    });
  }

  return xlsxLibraryPromise;
}

function normalizeSpreadsheetHeader(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function formatQuantity(value) {
  return roundQuantity(toNumber(value)).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function normalizeItemCode(value) {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value ?? "").trim();
}

function normalizeDeliveryDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30));
    date.setUTCDate(date.getUTCDate() + Math.floor(value));
    return date.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match
    ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
    : "";
}

async function parseFixedOrdersWorkbook(buffer, expectedDeliveryDate) {
  const XLSX = await loadXlsxLibrary();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("A planilha não possui uma aba para importar.");

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: true, blankrows: false });
  if (!rows.length) throw new Error("A planilha está vazia.");

  const normalizedHeaders = rows[0].map(normalizeSpreadsheetHeader);
  const requiredHeaders = {
    delivery: "entrega",
    quantity: "q. embalagem",
    nature: "natureza fiscal",
    code: "item",
    name: "descricao item",
  };
  const indexes = Object.fromEntries(
    Object.entries(requiredHeaders).map(([key, header]) => [key, normalizedHeaders.indexOf(header)])
  );
  const missingHeaders = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => requiredHeaders[key]);
  if (missingHeaders.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missingHeaders.join(", ")}.`);
  }

  const productsByCode = new Map();
  const errors = [];
  let ignoredCount = 0;
  let validLineCount = 0;

  rows.slice(1).forEach((columns, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const hasContent = columns.some((value) => String(value ?? "").trim());
    if (!hasContent) return;

    const nature = String(columns[indexes.nature] || "").trim().toUpperCase();
    if (nature !== fixedNature && nature !== orderNature) {
      ignoredCount += 1;
      return;
    }

    const deliveryDate = normalizeDeliveryDate(columns[indexes.delivery]);
    const code = normalizeItemCode(columns[indexes.code]);
    const spreadsheetName = String(columns[indexes.name] || "").trim();
    const quantity = Number(String(columns[indexes.quantity] ?? "").replace(",", "."));
    if (!deliveryDate || deliveryDate !== expectedDeliveryDate) {
      errors.push(`Linha ${rowNumber}: a entrega deve ser ${formatDate(expectedDeliveryDate)}.`);
      return;
    }
    if (!code || !spreadsheetName) {
      errors.push(`Linha ${rowNumber}: informe Item e Descrição Item.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || roundQuantity(quantity) !== quantity) {
      errors.push(`Linha ${rowNumber}: Q. Embalagem deve ser positiva e ter até 4 casas decimais.`);
      return;
    }

    const currentProduct = productsByCode.get(code) || {
      code,
      spreadsheetName,
      fixedQuantity: 0,
      orderQuantity: 0,
      sourceRows: 0,
    };
    if (nature === fixedNature) currentProduct.fixedQuantity += quantity;
    if (nature === orderNature) currentProduct.orderQuantity += quantity;
    currentProduct.fixedQuantity = roundQuantity(currentProduct.fixedQuantity);
    currentProduct.orderQuantity = roundQuantity(currentProduct.orderQuantity);
    currentProduct.sourceRows += 1;
    productsByCode.set(code, currentProduct);
    validLineCount += 1;
  });

  if (errors.length) {
    throw new Error(`${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` Mais ${errors.length - 3} erro(s).` : ""}`);
  }
  if (!productsByCode.size) throw new Error("Nenhuma linha de Fixo ou Encomenda foi encontrada.");

  return {
    products: Array.from(productsByCode.values()),
    validLineCount,
    ignoredCount,
  };
}

function normalizeStoreName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseStockQuantity(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const normalizedValue = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return Number(normalizedValue);
}

function hasValidStockQuantityPrecision(value) {
  if (typeof value === "number") return roundQuantity(value) === value;
  const text = String(value ?? "").trim();
  const normalizedValue = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  return /^\d+(?:\.\d{1,4})?$/.test(normalizedValue);
}

async function parseStockWorkbook(buffer) {
  const XLSX = await loadXlsxLibrary();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("A planilha não possui uma aba para importar.");

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: true, blankrows: false });
  if (!rows.length) throw new Error("A planilha está vazia.");

  const normalizedHeaders = rows[0].map(normalizeSpreadsheetHeader);
  const requiredHeaders = {
    store: "fantasia",
    stockDate: "data base",
    code: "item",
    quantity: "q. saldo",
  };
  const indexes = Object.fromEntries(
    Object.entries(requiredHeaders).map(([key, header]) => [key, normalizedHeaders.indexOf(header)])
  );
  const missingHeaders = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => requiredHeaders[key]);
  if (missingHeaders.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missingHeaders.join(", ")}.`);
  }

  const stores = new Set();
  const stockDates = new Set();
  const productsByCode = new Map();
  const errors = [];

  rows.slice(1).forEach((columns, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const hasContent = columns.some((value) => String(value ?? "").trim());
    if (!hasContent) return;

    const storeName = String(columns[indexes.store] || "").trim();
    const stockDate = normalizeDeliveryDate(columns[indexes.stockDate]);
    const code = normalizeItemCode(columns[indexes.code]);
    const quantity = parseStockQuantity(columns[indexes.quantity]);

    if (!code) return;
    if (!storeName || !stockDate) {
      errors.push(`Linha ${rowNumber}: informe Fantasia e Data Base.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0 || !hasValidStockQuantityPrecision(columns[indexes.quantity])) {
      errors.push(`Linha ${rowNumber}: Q. Saldo deve ser maior ou igual a zero e ter até 4 casas decimais.`);
      return;
    }
    if (productsByCode.has(code)) {
      errors.push(`Linha ${rowNumber}: o Item ${code} está duplicado.`);
      return;
    }

    stores.add(storeName);
    stockDates.add(stockDate);
    productsByCode.set(code, roundQuantity(quantity));
  });

  if (errors.length) {
    throw new Error(`${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` Mais ${errors.length - 3} erro(s).` : ""}`);
  }
  if (!productsByCode.size) throw new Error("Nenhum item de estoque foi encontrado.");
  if (stores.size !== 1) throw new Error("A planilha deve conter somente uma loja.");
  if (stockDates.size !== 1) throw new Error("A planilha deve conter somente uma Data Base.");

  return {
    storesByName: new Map([[
      normalizeStoreName(Array.from(stores)[0]),
      {
        storeName: Array.from(stores)[0],
        productsByCode,
      },
    ]]),
    stockDate: Array.from(stockDates)[0],
    ignoredLineCount: 0,
  };
}

function parseStockText(content, stockDate) {
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines[0] || "";
  const validHeader = (
    normalizeSpreadsheetHeader(header.slice(0, 18)) === "fantasia" &&
    normalizeSpreadsheetHeader(header.slice(18, 26)) === "item" &&
    normalizeSpreadsheetHeader(header.slice(26, 84)) === "descricao item" &&
    normalizeSpreadsheetHeader(header.slice(84, 92)) === "um" &&
    normalizeSpreadsheetHeader(header.slice(92, 108)) === "q. saldo" &&
    normalizeSpreadsheetHeader(header.slice(108)) === "situacao"
  );
  if (!validHeader) {
    throw new Error("O cabeçalho do TXT de estoque não corresponde ao modelo esperado.");
  }

  const storesByName = new Map();
  const errors = [];
  let ignoredLineCount = 0;

  lines.slice(1).forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 2;
    if (!line.trim()) return;

    const storeName = line.slice(0, 18).trim();
    const code = normalizeItemCode(line.slice(18, 26));
    const quantityText = line.slice(92, 108).trim();
    const status = normalizeStoreName(line.slice(108));
    if (line.length < 108 || !storeName || !code || !quantityText) {
      ignoredLineCount += 1;
      return;
    }
    if (status && status !== "ATIVO") {
      ignoredLineCount += 1;
      return;
    }

    const quantity = parseStockQuantity(quantityText);
    if (!Number.isFinite(quantity) || quantity < 0 || !hasValidStockQuantityPrecision(quantityText)) {
      errors.push(`Linha ${lineNumber}: Q. Saldo deve ser maior ou igual a zero e ter até 4 casas decimais.`);
      return;
    }

    const storeKey = normalizeStoreName(storeName);
    const store = storesByName.get(storeKey) || { storeName, productsByCode: new Map() };
    if (store.productsByCode.has(code)) {
      errors.push(`Linha ${lineNumber}: o Item ${code} está duplicado para ${storeName}.`);
      return;
    }
    store.productsByCode.set(code, roundQuantity(quantity));
    storesByName.set(storeKey, store);
  });

  if (errors.length) {
    throw new Error(`${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` Mais ${errors.length - 3} erro(s).` : ""}`);
  }
  if (!storesByName.size) throw new Error("Nenhum item de estoque válido foi encontrado no TXT.");

  return { storesByName, stockDate, ignoredLineCount };
}

function findImportedStockStore(storesByName, planningStoreName) {
  const planningStoreKey = normalizeStoreName(planningStoreName);
  const exactMatch = storesByName.get(planningStoreKey);
  if (exactMatch) return { storeKey: planningStoreKey, store: exactMatch };

  const tokenMatches = Array.from(storesByName.entries()).filter(([storeKey]) =>
    storeKey.split(" ").includes(planningStoreKey)
  );
  if (tokenMatches.length !== 1) return null;
  return { storeKey: tokenMatches[0][0], store: tokenMatches[0][1] };
}

function toLocalDate(value) {
  return new Date(`${value}T00:00:00`);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";
  return toLocalDate(value).toLocaleDateString("pt-BR");
}

function dateDiffInDays(startDate, endDate) {
  const startTime = toLocalDate(startDate).getTime();
  const endTime = toLocalDate(endDate).getTime();
  return Math.round((endTime - startTime) / 86400000);
}

function getDateRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const dates = [];
  const start = toLocalDate(startDate);
  const end = toLocalDate(endDate);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    dates.push(toInputDate(date));
  }

  return dates;
}

function buildCalendarDays(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function PeriodRangePicker({
  startDate,
  endDate,
  onChange,
  isDateDisabled,
  disabledHint,
}) {
  const [open, setOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(false);
  const [monthDate, setMonthDate] = useState(() => toLocalDate(startDate || today));
  const days = buildCalendarDays(monthDate);
  const inputLabel = startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : "";
  const startTime = startDate ? toLocalDate(startDate).getTime() : null;
  const endTime = endDate ? toLocalDate(endDate).getTime() : null;

  const handleDateClick = (date) => {
    const nextDate = toInputDate(date);
    if (isDateDisabled?.(nextDate, { selectingEnd: selectingStart && startDate && !endDate, startDate })) {
      return;
    }

    if (!selectingStart || !startDate || (startDate && endDate)) {
      onChange(nextDate, "");
      setSelectingStart(true);
      return;
    }

    if (toLocalDate(nextDate) < toLocalDate(startDate)) {
      onChange(nextDate, "");
      setSelectingStart(true);
      return;
    }

    onChange(startDate, nextDate);
    setSelectingStart(false);
    setOpen(false);
  };

  const moveMonth = (offset) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <div className="production-range-field">
      <button
        type="button"
        className="production-range-input"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{inputLabel || "Selecione o período"}</span>
        <span className="production-range-input__icon" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="production-calendar">
          <div className="production-calendar__top">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <strong>
              {monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </strong>
            <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">
              ›
            </button>
          </div>

          <div className="production-calendar__weekdays">
            {calendarWeekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="production-calendar__days">
            {days.map((date) => {
              const dateValue = toInputDate(date);
              const dateTime = date.getTime();
              const isOutsideMonth = date.getMonth() !== monthDate.getMonth();
              const isStart = dateValue === startDate;
              const isEnd = dateValue === endDate;
              const isInRange = startTime && endTime && dateTime > startTime && dateTime < endTime;
              const isDisabled = Boolean(
                isDateDisabled?.(dateValue, { selectingEnd: selectingStart && startDate && !endDate, startDate })
              );

              return (
                <button
                  key={dateValue}
                  type="button"
                  disabled={isDisabled}
                  className={[
                    "production-calendar__day",
                    isOutsideMonth ? "production-calendar__day--muted" : "",
                    isStart || isEnd ? "production-calendar__day--selected" : "",
                    isInRange ? "production-calendar__day--range" : "",
                    isDisabled ? "production-calendar__day--disabled" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleDateClick(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <p className="production-calendar__hint">
            {disabledHint || (selectingStart && startDate ? "Agora selecione uma data posterior." : "Selecione a data inicial.")}
          </p>
        </div>
      )}
    </div>
  );
}

function MultiStoreSelect({ stores, selectedStores, onToggleStore }) {
  const [open, setOpen] = useState(false);
  const label = selectedStores.length
    ? `${selectedStores.length} loja${selectedStores.length > 1 ? "s" : ""} selecionada${selectedStores.length > 1 ? "s" : ""}`
    : "Selecione as lojas";

  return (
    <div className="production-store-multiselect">
      <button
        type="button"
        className="production-range-input"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className="production-range-input__icon" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="production-store-menu">
          {stores.map((store) => (
            <label key={store.id} className="production-store-menu__item">
              <input
                type="checkbox"
                checked={selectedStores.includes(store.displayName)}
                onChange={() => onToggleStore(store.displayName)}
              />
              <span>{store.displayName}</span>
            </label>
          ))}
          {!stores.length && (
            <label className="production-store-menu__item">
              <span>Nenhuma loja cadastrada</span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function displayPercent(value, focused) {
  if (value === "" || value === null || value === undefined) return "";
  return focused ? String(value) : `${value}%`;
}

function toNumber(value) {
  const numericValue = value === "" || value === null || value === undefined ? 0 : Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getAdditionalQuantity(product) {
  return roundQuantity(toNumber(product.fixedQuantity) + toNumber(product.orderQuantity));
}

function isProductStockAvailable(product) {
  return !product.stockStatus || product.stockStatus === "available" || product.stockStatus === "not_found";
}

function calculateSuggestion(
  averageSold,
  increasePercent,
  fixedQuantity = 0,
  orderQuantity = 0,
  stockQuantity = 0,
  stockStatus = "available"
) {
  const baseQuantity = Math.max(0, Math.ceil(toNumber(averageSold) * (1 + (toNumber(increasePercent) / 100))));
  const availableStock = stockStatus === "available" || stockStatus === "not_found"
    ? Math.max(0, toNumber(stockQuantity))
    : 0;
  return String(roundQuantity(Math.max(
    0,
    baseQuantity + toNumber(fixedQuantity) + toNumber(orderQuantity) - availableStock
  )));
}

function StockQuantity({ product }) {
  if (!isProductStockAvailable(product) || product.stockQuantity === null || product.stockQuantity === undefined) {
    return <span className="production-stock-unavailable" title={product.stockReason || "Estoque indisponível."}>Indisponível</span>;
  }
  return formatQuantity(product.stockQuantity);
}

function ServedDates({ dates }) {
  const servedDates = Array.from(new Set(Array.isArray(dates) ? dates : [])).sort();
  if (!servedDates.length) return "-";

  return (
    <div className="production-served-dates">
      {servedDates.map((dateValue) => {
        const date = toLocalDate(dateValue);
        const formattedDate = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        return (
          <span key={dateValue} title={date.toLocaleDateString("pt-BR")}>
            {calendarWeekdays[date.getDay()]} {formattedDate}
          </span>
        );
      })}
    </div>
  );
}

function normalizeProducts(products) {
  return sortProductsByName(products.map((product) => ({
    ...product,
    suggestion: String(product.suggestion),
    fixedQuantity: roundQuantity(toNumber(product.fixedQuantity)),
    orderQuantity: roundQuantity(toNumber(product.orderQuantity)),
    stockStatus: product.stockStatus || (
      product.stockQuantity === null || product.stockQuantity === undefined ? "unavailable" : "available"
    ),
    stockReason: product.stockReason || "",
    increasePercent: product.increasePercent === null || product.increasePercent === undefined
      ? ""
      : String(product.increasePercent),
  })));
}

function normalizeDayProducts(products) {
  return products.map((product) => ({
    ...product,
    suggestion: toNumber(product.suggestion),
    fixedQuantity: roundQuantity(toNumber(product.fixedQuantity)),
    orderQuantity: roundQuantity(toNumber(product.orderQuantity)),
    increasePercent: toNullableNumber(product.increasePercent),
  }));
}

function mergeRecalculatedProducts(recalculatedProducts, existingProducts, convertedOrders = [], convertedStocks = []) {
  const existingByCode = new Map((existingProducts || []).map((product) => [String(product.code), product]));
  const fallbackStockProduct = (existingProducts || []).find((product) => product.stockSource);
  const ordersByCode = new Map(convertedOrders.map((item) => [String(item.code), item]));
  const stocksByCode = new Map(convertedStocks.map((item) => [String(item.code), item]));
  const mergedProducts = normalizeProducts(recalculatedProducts).map((recalculatedProduct) => {
    const existingProduct = existingByCode.get(String(recalculatedProduct.code));
    const convertedOrder = ordersByCode.get(String(recalculatedProduct.code));
    const convertedStock = stocksByCode.get(String(recalculatedProduct.code));
    const preserveExistingStock = Boolean(existingProduct?.stockSource);
    const hasTrackedOrderSources = Boolean(existingProduct?.fixedOrderSources?.length);
    const nextProduct = {
      ...recalculatedProduct,
      increasePercent: existingProduct?.increasePercent ?? "",
      fixedQuantity: convertedOrder?.fixedQuantity ?? (hasTrackedOrderSources ? 0 : existingProduct?.fixedQuantity ?? 0),
      orderQuantity: convertedOrder?.orderQuantity ?? (hasTrackedOrderSources ? 0 : existingProduct?.orderQuantity ?? 0),
      fixedOrderSources: convertedOrder?.sources ?? (hasTrackedOrderSources ? [] : existingProduct?.fixedOrderSources ?? []),
      importedOnly: existingProduct?.importedOnly || Boolean(convertedOrder),
      ...(convertedStock ? {
        stockQuantity: convertedStock.quantity,
        stockStatus: convertedStock.status,
        stockDate: existingProduct?.stockDate || fallbackStockProduct?.stockDate || "",
        stockReason: convertedStock.reason || "",
        stockSource: existingProduct?.stockSource || fallbackStockProduct?.stockSource || "",
        stockSources: convertedStock.sources || [],
      } : preserveExistingStock ? {
        stockQuantity: existingProduct.stockQuantity,
        stockStatus: existingProduct.stockStatus,
        stockDate: existingProduct.stockDate,
        stockReason: existingProduct.stockReason,
        stockSource: existingProduct.stockSource,
        stockSources: existingProduct.stockSources || [],
      } : {}),
    };
    return {
      ...nextProduct,
      suggestion: calculateSuggestion(
        nextProduct.averageSold,
        nextProduct.increasePercent,
        nextProduct.fixedQuantity,
        nextProduct.orderQuantity,
        nextProduct.stockQuantity,
        nextProduct.stockStatus
      ),
    };
  });
  const recalculatedCodes = new Set(mergedProducts.map((product) => String(product.code)));
  const legacyProducts = (existingProducts || []).filter((product) =>
    !recalculatedCodes.has(String(product.code)) &&
    !(product.fixedOrderSources || []).length &&
    !(product.stockSources || []).length &&
    (toNumber(product.fixedQuantity) > 0 || toNumber(product.orderQuantity) > 0 || Boolean(product.stockSource))
  );
  return [...mergedProducts, ...legacyProducts].sort(compareProductsByName);
}

function getConsolidatedStoreProducts(productsByDay) {
  const productMap = new Map();

  Object.values(productsByDay || {}).forEach((dayProducts) => {
    dayProducts.forEach((product) => {
      const currentProduct = productMap.get(product.code) || {
        code: product.code,
        name: product.name,
        averageSold: 0,
        stockQuantity: 0,
        stockUnavailable: false,
        stockDate: product.stockDate || "",
        stockReasons: new Set(),
        suggestion: 0,
        fixedQuantity: 0,
        orderQuantity: 0,
        servedDates: new Set(),
        increasePercentTotal: 0,
        increasePercentOccurrences: 0,
      };

      currentProduct.averageSold += toNumber(product.averageSold);
      if (isProductStockAvailable(product) && product.stockQuantity !== null && product.stockQuantity !== undefined) {
        currentProduct.stockQuantity = roundQuantity(currentProduct.stockQuantity + toNumber(product.stockQuantity));
      } else {
        currentProduct.stockUnavailable = true;
        if (product.stockReason) currentProduct.stockReasons.add(product.stockReason);
      }
      if (!currentProduct.stockDate && product.stockDate) currentProduct.stockDate = product.stockDate;
      currentProduct.suggestion = roundQuantity(currentProduct.suggestion + toNumber(product.suggestion));
      currentProduct.fixedQuantity = roundQuantity(currentProduct.fixedQuantity + toNumber(product.fixedQuantity));
      currentProduct.orderQuantity = roundQuantity(currentProduct.orderQuantity + toNumber(product.orderQuantity));
      (product.servedDates || []).forEach((dateValue) => currentProduct.servedDates.add(dateValue));
      if (toNullableNumber(product.increasePercent) !== null) {
        currentProduct.increasePercentTotal += toNumber(product.increasePercent);
        currentProduct.increasePercentOccurrences += 1;
      }
      productMap.set(product.code, currentProduct);
    });
  });

  return sortProductsByName(Array.from(productMap.values()).map((product) => ({
    code: product.code,
    name: product.name,
    averageSold: product.averageSold,
    stockQuantity: product.stockUnavailable ? null : product.stockQuantity,
    stockStatus: product.stockUnavailable ? "unavailable" : "available",
    stockDate: product.stockDate,
    stockReason: Array.from(product.stockReasons).join(" "),
    suggestion: product.suggestion,
    fixedQuantity: product.fixedQuantity,
    orderQuantity: product.orderQuantity,
    servedDates: Array.from(product.servedDates).sort(),
    increasePercent: product.increasePercentOccurrences
      ? Number((product.increasePercentTotal / product.increasePercentOccurrences).toFixed(2))
      : null,
  })));
}

function NewProductionPlanning() {
  const navigate = useNavigate();
  const fixedOrdersFileInputRef = useRef(null);
  const stockFileInputRef = useRef(null);
  const { day: editingDayParam } = useParams();
  const isEditing = Boolean(editingDayParam);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState("");
  const [editLoading, setEditLoading] = useState(isEditing);
  const [editLoadError, setEditLoadError] = useState("");
  const [calculationDirty, setCalculationDirty] = useState(false);
  const [servedStartDate, setServedStartDate] = useState(editingDayParam || today);
  const [servedEndDate, setServedEndDate] = useState(editingDayParam || today);
  const [comparisonStartDate, setComparisonStartDate] = useState(isEditing ? "" : today);
  const [comparisonEndDate, setComparisonEndDate] = useState(isEditing ? "" : today);
  const [selectedStores, setSelectedStores] = useState([]);
  const [activeStore, setActiveStore] = useState("");
  const [activeDay, setActiveDay] = useState(consolidatedTab);
  const [productsByStoreAndDay, setProductsByStoreAndDay] = useState({});
  const [defaultIncreaseByStoreAndDay, setDefaultIncreaseByStoreAndDay] = useState({});
  const [focusedPercentField, setFocusedPercentField] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [hasSuggested, setHasSuggested] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(isEditing);
  const [productionStores, setProductionStores] = useState([]);
  const [savedStoreReferences, setSavedStoreReferences] = useState({});
  const [storesLoading, setStoresLoading] = useState(true);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [productsMessage, setProductsMessage] = useState("");
  const [stockSource, setStockSource] = useState("everest");
  const [importedStock, setImportedStock] = useState(null);
  const [stockWarnings, setStockWarnings] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [stockImportLoading, setStockImportLoading] = useState(false);
  const [stockImportWarning, setStockImportWarning] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [registeringProductCodes, setRegisteringProductCodes] = useState([]);
  const productionDays = useMemo(
    () => getDateRange(servedStartDate, servedEndDate),
    [servedEndDate, servedStartDate]
  );
  const getStoreRouteWeekdays = (storeName) => {
    const store = productionStores.find((item) => item.displayName === storeName);
    return store?.routeWeekdays?.length ? store.routeWeekdays : allWeekdays;
  };
  const getProductionDaysForStore = (storeName) => {
    if (isEditing && productsByStoreAndDay[storeName]?.[editingDayParam]) {
      return [editingDayParam];
    }
    const routeWeekdays = getStoreRouteWeekdays(storeName);
    return productionDays.filter((day) => routeWeekdays.includes(toLocalDate(day).getDay()));
  };
  const activeStoreProductionDays = activeStore ? getProductionDaysForStore(activeStore) : [];
  const activeStoreProductsByDay = productsByStoreAndDay[activeStore] || {};
  const isConsolidatedActive = activeDay === consolidatedTab;
  const activeProducts = isConsolidatedActive
    ? getConsolidatedStoreProducts(activeStoreProductsByDay)
    : activeStoreProductsByDay[activeDay] || [];

  const visibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    if (!normalizedQuery) return activeProducts;
    return activeProducts.filter((product) =>
      `${product.code} ${product.name}`.toLowerCase().includes(normalizedQuery)
    );
  }, [activeProducts, productQuery]);
  const productionRangeRule = useMemo(() => {
    if (!servedStartDate || !servedEndDate) return null;
    return {
      startWeekday: toLocalDate(servedStartDate).getDay(),
      endWeekday: toLocalDate(servedEndDate).getDay(),
      durationDays: dateDiffInDays(servedStartDate, servedEndDate),
    };
  }, [servedStartDate, servedEndDate]);
  const selectableProductionStores = useMemo(() => {
    const savedNames = new Set(Object.keys(productsByStoreAndDay));
    const savedNamesById = new Map(Object.entries(savedStoreReferences).map(([storeName, id]) => [id, storeName]));
    const productionWeekday = editingDayParam ? toLocalDate(editingDayParam).getDay() : null;
    const eligibleStores = isEditing
      ? productionStores.filter((store) => {
        const savedName = savedNamesById.get(store.id);
        if (savedName && savedName !== store.displayName) return false;
        return savedNames.has(store.displayName) ||
          !store.routeWeekdays?.length || store.routeWeekdays.includes(productionWeekday);
      })
      : productionStores;
    const knownNames = new Set(eligibleStores.map((store) => store.displayName));
    const savedMissingStores = selectedStores
      .filter((storeName) => productsByStoreAndDay[storeName] && !knownNames.has(storeName))
      .map((storeName) => ({
        id: savedStoreReferences[storeName] || `saved-${storeName}`,
        displayName: storeName,
        routeWeekdays: [],
      }));
    return [...eligibleStores, ...savedMissingStores];
  }, [editingDayParam, isEditing, productionStores, productsByStoreAndDay, savedStoreReferences, selectedStores]);

  useEffect(() => {
    if (!isEditing) return;
    let active = true;
    setEditLoading(true);
    setEditLoadError("");
    api.get(`/admin/production-planning/${editingDayParam}`)
      .then((response) => {
        if (!active) return;
        const planning = response.data;
        if (planning.status === "finalizado") {
          setEditLoadError("Planejamentos finalizados não podem ser editados.");
          return;
        }
        const storeNames = Object.keys(planning.stores || {});
        setServedStartDate(planning.day);
        setServedEndDate(planning.day);
        setComparisonStartDate(planning.comparisonStartDate);
        setComparisonEndDate(planning.comparisonEndDate);
        setSelectedStores(storeNames);
        setActiveStore(storeNames[0] || "");
        setActiveDay(consolidatedTab);
        setProductsByStoreAndDay(Object.fromEntries(storeNames.map((storeName) => [
          storeName,
          { [planning.day]: normalizeProducts(planning.stores[storeName].products || []) },
        ])));
        setSavedStoreReferences(Object.fromEntries(storeNames.map((storeName) => [
          storeName,
          planning.stores[storeName].productionStoreId,
        ])));
        setDefaultIncreaseByStoreAndDay(Object.fromEntries(storeNames.map((storeName) => [
          storeName,
          {
            [planning.day]: planning.stores[storeName].defaultIncreasePercent === null ||
              planning.stores[storeName].defaultIncreasePercent === undefined
              ? ""
              : String(planning.stores[storeName].defaultIncreasePercent),
          },
        ])));
        setEditingUpdatedAt(planning.updatedAt);
        setHasSuggested(true);
        setCalculationDirty(false);
      })
      .catch((error) => {
        if (active) setEditLoadError(error.response?.data?.error || "Não foi possível carregar o planejamento.");
      })
      .finally(() => {
        if (active) setEditLoading(false);
      });
    return () => { active = false; };
  }, [editingDayParam, isEditing]);

  useEffect(() => {
    if (!selectedStores.includes(activeStore)) {
      setActiveStore(selectedStores[0] || "");
      setActiveDay(consolidatedTab);
      setProductQuery("");
      setFocusedPercentField("");
    }
  }, [activeStore, selectedStores]);

  useEffect(() => {
    if (activeDay !== consolidatedTab && !activeStoreProductionDays.includes(activeDay)) {
      setActiveDay(consolidatedTab);
      setProductQuery("");
      setFocusedPercentField("");
    }
  }, [activeDay, activeStoreProductionDays]);

  useEffect(() => {
    if (isEditing || selectedStores.length || !productionStores.length) return;

    const firstStore = productionStores[0].displayName;
    setSelectedStores([firstStore]);
    setActiveStore(firstStore);
    setDefaultIncreaseByStoreAndDay((currentValues) => ({
      ...currentValues,
      [firstStore]: currentValues[firstStore] || {},
    }));
  }, [isEditing, productionStores, selectedStores.length]);

  useEffect(() => {
    if (isEditing || !productionRangeRule || !comparisonStartDate || !comparisonEndDate) return;

    const comparisonMatches =
      toLocalDate(comparisonStartDate).getDay() === productionRangeRule.startWeekday &&
      toLocalDate(comparisonEndDate).getDay() === productionRangeRule.endWeekday &&
      dateDiffInDays(comparisonStartDate, comparisonEndDate) === productionRangeRule.durationDays;

    if (!comparisonMatches) {
      setComparisonStartDate("");
      setComparisonEndDate("");
    }
  }, [comparisonEndDate, comparisonStartDate, isEditing, productionRangeRule]);

  useEffect(() => {
    let active = true;

    api.get("/admin/production-stores/planning")
      .then((response) => {
        if (!active) return;
        setProductionStores(response.data);
      })
      .catch(() => {
        if (active) {
          setProductionStores([]);
          setProductsMessage("Não foi possível carregar as lojas cadastradas.");
        }
      })
      .finally(() => {
        if (active) {
          setStoresLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const isComparisonDateDisabled = (dateValue, context = {}) => {
    if (isEditing) return false;
    if (!productionRangeRule) return false;
    const date = toLocalDate(dateValue);

    if (context.selectingEnd && context.startDate) {
      const expectedEnd = new Date(toLocalDate(context.startDate));
      expectedEnd.setDate(expectedEnd.getDate() + productionRangeRule.durationDays);
      return dateValue !== toInputDate(expectedEnd);
    }

    return date.getDay() !== productionRangeRule.startWeekday;
  };

  const validatePlanningFilters = () => {
    if (!servedStartDate || !servedEndDate || !comparisonStartDate || !comparisonEndDate || !selectedStores.length) {
      return false;
    }

    if (!productionRangeRule) return false;

    if (isEditing) {
      const comparisonDates = getDateRange(comparisonStartDate, comparisonEndDate);
      const productionWeekday = toLocalDate(editingDayParam).getDay();
      return comparisonStartDate <= comparisonEndDate && comparisonDates.some((dateValue) =>
        toLocalDate(dateValue).getDay() === productionWeekday
      );
    }

    return (
      toLocalDate(comparisonStartDate).getDay() === productionRangeRule.startWeekday &&
      toLocalDate(comparisonEndDate).getDay() === productionRangeRule.endWeekday &&
      dateDiffInDays(comparisonStartDate, comparisonEndDate) === productionRangeRule.durationDays
    );
  };

  const handleStockSourceChange = (nextSource) => {
    if (nextSource === stockSource) return;
    setStockSource(nextSource);
    setImportedStock(null);
    setImportMessage("");
    setStockImportWarning("");
    setStockWarnings([]);
    setProductsMessage("");
    if (hasSuggested) {
      setProductsByStoreAndDay({});
      setHasSuggested(false);
      setIsHeaderCollapsed(false);
    }
  };

  const handleToggleStore = (storeName) => {
    const isAddingStore = !selectedStores.includes(storeName);
    setSelectedStores((currentStores) => {
      if (currentStores.includes(storeName)) {
        return currentStores.filter((item) => item !== storeName);
      }

      return [...currentStores, storeName];
    });
    setDefaultIncreaseByStoreAndDay((currentValues) => ({
      ...currentValues,
      [storeName]: currentValues[storeName] || Object.fromEntries(
        getProductionDaysForStore(storeName).map((day) => [day, initialDefaultIncreasePercent])
      ),
    }));
    if (hasSuggested && isAddingStore) {
      setProductsMessage("Clique em Sugerir produção novamente para carregar a loja adicionada.");
    }
    if (hasSuggested) setCalculationDirty(true);
    if (!isEditing && stockSource === "spreadsheet") {
      setImportedStock(null);
      setImportMessage("");
      setStockImportWarning("As lojas foram alteradas. Importe novamente o arquivo de estoque.");
    }
  };

  const handleSuggestProduction = async () => {
    if (!validatePlanningFilters() || (!isEditing && stockSource === "spreadsheet" && !importedStock)) return;

    const nextDefaultIncreaseByStoreAndDay = Object.fromEntries(
      selectedStores.map((storeName) => [
        storeName,
        {
          ...(defaultIncreaseByStoreAndDay[storeName] || {}),
          ...Object.fromEntries(
            getProductionDaysForStore(storeName).map((day) => [
              day,
              initialDefaultIncreasePercent,
            ])
          ),
        },
      ])
    );

    setSuggestionLoading(true);
    setProductsMessage("");
    setStockWarnings([]);

    try {
      const response = await api.post("/admin/production-planning/suggestions", {
        comparisonStartDate,
        comparisonEndDate,
        ...(isEditing ? { planningDay: editingDayParam } : {}),
        stockSource: isEditing ? "preserved" : stockSource,
        ...(!isEditing && stockSource === "spreadsheet" ? { importedStock } : {}),
        stores: selectedStores.map((storeName) => ({
          displayName: storeName,
          days: getProductionDaysForStore(storeName).map((day) => ({
            day,
          })),
        })),
      });

      const convertedImportsByKey = new Map();
      const convertedStocksByKey = new Map();
      if (isEditing) {
        const orderGroups = [];
        const stockGroups = [];
        Object.entries(response.data?.stores || {}).forEach(([storeName, productsByDay]) => {
          Object.entries(productsByDay).forEach(([day, recalculatedProducts]) => {
            const existingProducts = productsByStoreAndDay[storeName]?.[day] || [];
            const orderSources = existingProducts.flatMap((product) => product.fixedOrderSources || []);
            if (orderSources.length) orderGroups.push({ key: `${storeName}::${day}`, items: orderSources });
            const stockSources = existingProducts.flatMap((product) => product.stockSources || []);
            if (stockSources.length) {
              const sourceByCode = new Map(stockSources.map((source) => [String(source.code), source]));
              stockGroups.push({
                key: `${storeName}::${day}`,
                items: Array.from(sourceByCode.values()),
                outputCodes: recalculatedProducts.map((product) => product.code),
              });
            }
          });
        });
        const [ordersResponse, stocksResponse] = await Promise.all([
          orderGroups.length
            ? api.post("/admin/production-planning/conversions/apply", { mode: "orders", groups: orderGroups })
            : Promise.resolve({ data: { groups: [] } }),
          stockGroups.length
            ? api.post("/admin/production-planning/conversions/apply", { mode: "stock", groups: stockGroups })
            : Promise.resolve({ data: { groups: [] } }),
        ]);
        (ordersResponse.data?.groups || []).forEach((group) => convertedImportsByKey.set(group.key, group.items));
        (stocksResponse.data?.groups || []).forEach((group) => convertedStocksByKey.set(group.key, group.items));
      }

      setProductsByStoreAndDay((currentProductsByStoreAndDay) => Object.fromEntries(
        Object.entries(response.data?.stores || {}).map(([storeName, productsByDay]) => [
          storeName,
          Object.fromEntries(
            Object.entries(productsByDay).map(([day, products]) => [
              day,
              isEditing
                ? mergeRecalculatedProducts(
                    products,
                    currentProductsByStoreAndDay[storeName]?.[day],
                    convertedImportsByKey.get(`${storeName}::${day}`),
                    convertedStocksByKey.get(`${storeName}::${day}`)
                  )
                : normalizeProducts(products),
            ])
          ),
        ])
      ));
      setStockWarnings(Array.isArray(response.data?.warnings) ? response.data.warnings : []);
      setDefaultIncreaseByStoreAndDay(nextDefaultIncreaseByStoreAndDay);
      setActiveStore((currentStore) => selectedStores.includes(currentStore) ? currentStore : selectedStores[0]);
      setActiveDay(consolidatedTab);
      setProductQuery("");
      setFocusedPercentField("");
      setHasSuggested(true);
      setIsHeaderCollapsed(true);
      setCalculationDirty(false);
    } catch (error) {
      setProductsMessage(error.response?.data?.error || "Não foi possível sugerir a produção.");
    } finally {
      setSuggestionLoading(false);
    }
  };

  const updateProduct = (code, field, value) => {
    if (isConsolidatedActive) return;
    const nextValue = normalizeDecimalInput(value, { allowPercent: field === "increasePercent" });
    if (nextValue === null) return;
    setProductsByStoreAndDay((currentProductsByStoreAndDay) => ({
      ...currentProductsByStoreAndDay,
      [activeStore]: {
        ...(currentProductsByStoreAndDay[activeStore] || {}),
        [activeDay]: (currentProductsByStoreAndDay[activeStore]?.[activeDay] || []).map((product) =>
          product.code === code
            ? {
                ...product,
                [field]: nextValue,
                ...(field === "increasePercent"
                  ? {
                      suggestion: calculateSuggestion(
                        product.averageSold,
                        nextValue,
                        product.fixedQuantity,
                        product.orderQuantity,
                        product.stockQuantity,
                        product.stockStatus
                      ),
                    }
                  : {}),
              }
            : product
        ),
      },
    }));
  };

  const handleDefaultIncreaseChange = (event) => {
    if (isConsolidatedActive) return;
    const nextValue = normalizeDecimalInput(event.target.value, { allowPercent: true });
    if (nextValue === null) return;
    setDefaultIncreaseByStoreAndDay((currentValues) => ({
      ...currentValues,
      [activeStore]: {
        ...(currentValues[activeStore] || {}),
        [activeDay]: nextValue,
      },
    }));
    setProductsByStoreAndDay((currentProductsByStoreAndDay) => ({
      ...currentProductsByStoreAndDay,
      [activeStore]: {
        ...(currentProductsByStoreAndDay[activeStore] || {}),
        [activeDay]: (currentProductsByStoreAndDay[activeStore]?.[activeDay] || []).map((product) => ({
          ...product,
          increasePercent: nextValue,
          suggestion: calculateSuggestion(
            product.averageSold,
            nextValue,
            product.fixedQuantity,
            product.orderQuantity,
            product.stockQuantity,
            product.stockStatus
          ),
        })),
      },
    }));
  };

  const closeImportPreview = () => {
    if (importLoading || registeringProductCodes.length) return;
    setImportPreview(null);
  };

  const handleFixedOrdersFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isConsolidatedActive || !activeStore || !activeDay) return;

    const importStore = activeStore;
    const importDay = activeDay;
    setImportLoading(true);
    setImportMessage("");
    setProductsMessage("");

    try {
      const [buffer, catalogResponse] = await Promise.all([
        file.arrayBuffer(),
        api.get("/admin/production-products/planning"),
      ]);
      const parsed = await parseFixedOrdersWorkbook(buffer, importDay);
      const conversionResponse = await api.post("/admin/production-planning/conversions/apply", {
        mode: "orders",
        groups: [{
          key: `${importStore}::${importDay}`,
          items: parsed.products.map((product) => ({
            code: product.code,
            name: product.spreadsheetName,
            fixedQuantity: product.fixedQuantity,
            orderQuantity: product.orderQuantity,
          })),
        }],
      });
      const convertedProducts = conversionResponse.data?.groups?.[0]?.items || [];
      const catalogByCode = new Map(
        (catalogResponse.data || []).map((product) => [String(product.code).trim(), product])
      );
      const existingProductsByCode = new Map(
        (productsByStoreAndDay[importStore]?.[importDay] || []).map((product) => [String(product.code), product])
      );

      setImportPreview({
        storeName: importStore,
        day: importDay,
        fileName: file.name,
        validLineCount: parsed.validLineCount,
        ignoredCount: parsed.ignoredCount,
        products: sortProductsByName(convertedProducts.map((product) => ({
          ...product,
          spreadsheetName: product.name,
          registeredProduct: catalogByCode.get(product.code) || null,
          currentFixedQuantity: roundQuantity(toNumber(existingProductsByCode.get(String(product.code))?.fixedQuantity)),
          currentOrderQuantity: roundQuantity(toNumber(existingProductsByCode.get(String(product.code))?.orderQuantity)),
          currentAdditionalQuantity: roundQuantity(
            toNumber(existingProductsByCode.get(String(product.code))?.fixedQuantity) +
            toNumber(existingProductsByCode.get(String(product.code))?.orderQuantity)
          ),
          nextAdditionalQuantity: roundQuantity(
            toNumber(existingProductsByCode.get(String(product.code))?.fixedQuantity) +
            toNumber(existingProductsByCode.get(String(product.code))?.orderQuantity) +
            toNumber(product.fixedQuantity) +
            toNumber(product.orderQuantity)
          ),
        }))),
      });
    } catch (error) {
      setProductsMessage(error.response?.data?.error || error.message || "Nao foi possivel importar a planilha.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleStockFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isEditing || stockSource !== "spreadsheet") return;

    setStockImportLoading(true);
    setImportedStock(null);
    setImportMessage("");
    setStockImportWarning("");
    setProductsMessage("");
    if (hasSuggested) {
      setProductsByStoreAndDay({});
      setHasSuggested(false);
      setIsHeaderCollapsed(false);
    }

    try {
      const isTextFile = /\.txt$/i.test(file.name) || file.type.startsWith("text/");
      const currentDate = toInputDate(new Date());
      const fileContent = isTextFile ? await file.text() : await file.arrayBuffer();
      const parsed = isTextFile
        ? parseStockText(fileContent, currentDate)
        : await parseStockWorkbook(fileContent);

      const planningStoreNames = selectedStores;
      const importedStoreByPlanningName = new Map(planningStoreNames.map((storeName) => [
        storeName,
        findImportedStockStore(parsed.storesByName, storeName),
      ]));
      const matchedFileStoreKeys = new Set(
        Array.from(importedStoreByPlanningName.values()).filter(Boolean).map((match) => match.storeKey)
      );
      const matchedStoreCount = Array.from(importedStoreByPlanningName.values()).filter(Boolean).length;
      const missingPlanningStoreCount = planningStoreNames.length - matchedStoreCount;
      const ignoredFileStores = Array.from(parsed.storesByName.keys())
        .filter((storeKey) => !matchedFileStoreKeys.has(storeKey));
      const normalizedStores = [];
      planningStoreNames.forEach((storeName) => {
        const matchedStore = importedStoreByPlanningName.get(storeName)?.store;
        if (!matchedStore) return;
        normalizedStores.push({
          displayName: storeName,
          items: Array.from(matchedStore.productsByCode.entries()).map(([code, quantity]) => ({ code, quantity })),
        });
      });
      ignoredFileStores.forEach((storeKey) => {
        const store = parsed.storesByName.get(storeKey);
        normalizedStores.push({
          displayName: store.storeName,
          items: Array.from(store.productsByCode.entries()).map(([code, quantity]) => ({ code, quantity })),
        });
      });
      setImportedStock({ stockDate: parsed.stockDate, stores: normalizedStores, fileName: file.name });

      const warnings = [];
      if (parsed.stockDate !== currentDate) {
        warnings.push(`A data-base importada é ${formatDate(parsed.stockDate)}, diferente de hoje.`);
      }
      if (parsed.ignoredLineCount) {
        warnings.push(`${parsed.ignoredLineCount} linha(s) incompleta(s) ou inativa(s) foram ignoradas.`);
      }
      if (ignoredFileStores.length) {
        warnings.push(`${ignoredFileStores.length} loja(s) do arquivo não fazem parte deste planejamento.`);
      }
      if (missingPlanningStoreCount) {
        warnings.push(`${missingPlanningStoreCount} loja(s) do planejamento não foram encontradas no arquivo e receberam estoque zero.`);
      }
      setStockImportWarning(warnings.join(" "));
      const itemCount = normalizedStores.reduce((total, store) => total + store.items.length, 0);
      setImportMessage(`${file.name}: ${itemCount} saldo(s) lidos. Clique em Sugerir produção para aplicar o estoque.`);
    } catch (error) {
      setImportedStock(null);
      setProductsMessage(error.response?.data?.error || error.message || "Não foi possível importar a planilha de estoque.");
    } finally {
      setStockImportLoading(false);
    }
  };

  const handleRegisterImportedProduct = async (code) => {
    const previewProduct = importPreview?.products.find((product) => product.code === code);
    if (!previewProduct || previewProduct.registeredProduct) return;

    setRegisteringProductCodes((currentCodes) => [...currentCodes, code]);
    try {
      const response = await api.post("/admin/production-products", {
        code,
        name: previewProduct.spreadsheetName,
      });
      setImportPreview((currentPreview) => currentPreview ? {
        ...currentPreview,
        products: currentPreview.products.map((product) => product.code === code
          ? { ...product, registeredProduct: response.data }
          : product),
      } : currentPreview);
    } catch (error) {
      setProductsMessage(error.response?.data?.error || "Nao foi possivel cadastrar o produto.");
    } finally {
      setRegisteringProductCodes((currentCodes) => currentCodes.filter((item) => item !== code));
    }
  };

  const handleValidateImport = async () => {
    if (!importPreview || importPreview.products.some((product) => !product.registeredProduct)) return;

    const preview = importPreview;
    setImportLoading(true);
    let stockByCode = {};
    try {
      const response = await api.post("/admin/production-planning/stocks", {
        ...(isEditing ? { planningDay: editingDayParam } : {}),
        stockSource: isEditing ? "preserved" : stockSource,
        ...(!isEditing && stockSource === "spreadsheet" ? { importedStock } : {}),
        stores: [{
          displayName: preview.storeName,
          productCodes: preview.products.map((product) => product.code),
        }],
      });
      stockByCode = response.data?.stores?.[preview.storeName] || {};
      setStockWarnings((currentWarnings) => Array.from(new Set([
        ...currentWarnings,
        ...(Array.isArray(response.data?.warnings) ? response.data.warnings : []),
      ])));
    } catch (error) {
      const warning = error.response?.data?.error || "Não foi possível consultar o estoque dos produtos importados.";
      setStockWarnings((currentWarnings) => Array.from(new Set([...currentWarnings, warning])));
      stockByCode = Object.fromEntries(preview.products.map((product) => [product.code, {
        stockQuantity: null,
        stockStatus: "unavailable",
        stockDate: "",
        stockReason: warning,
      }]));
    }

    const importedByCode = new Map(preview.products.map((product) => [product.code, product]));
    setProductsByStoreAndDay((currentProductsByStoreAndDay) => {
      const currentDayProducts = currentProductsByStoreAndDay[preview.storeName]?.[preview.day] || [];
      const existingCodes = new Set(currentDayProducts.map((product) => String(product.code)));
      const updatedProducts = currentDayProducts.map((product) => {
        const importedProduct = importedByCode.get(String(product.code));
        if (!importedProduct) return product;
        const fixedQuantity = roundQuantity(toNumber(product.fixedQuantity) + toNumber(importedProduct.fixedQuantity));
        const orderQuantity = roundQuantity(toNumber(product.orderQuantity) + toNumber(importedProduct.orderQuantity));
        const stockData = importedProduct && !product.stockSource
          ? stockByCode[String(product.code)] || {}
          : {};
        const nextProduct = {
          ...product,
          ...stockData,
          fixedQuantity,
          orderQuantity,
          fixedOrderSources: [
            ...(product.fixedOrderSources || []),
            ...(importedProduct.sources || []),
          ],
        };
        return {
          ...nextProduct,
          suggestion: calculateSuggestion(
            nextProduct.averageSold,
            nextProduct.increasePercent,
            fixedQuantity,
            orderQuantity,
            nextProduct.stockQuantity,
            nextProduct.stockStatus
          ),
        };
      });
      const addedProducts = preview.products
        .filter((product) => !existingCodes.has(product.code))
        .map((product) => {
          const increasePercent = defaultIncreaseByStoreAndDay[preview.storeName]?.[preview.day] || "";
          const stockData = stockByCode[product.code] || {
            stockQuantity: null,
            stockStatus: "unavailable",
            stockDate: "",
            stockReason: "Estoque não consultado.",
          };
          return {
            code: product.code,
            name: product.registeredProduct.name,
            averageSold: 0,
            ...stockData,
            servedDates: [],
            increasePercent,
            fixedQuantity: product.fixedQuantity,
            orderQuantity: product.orderQuantity,
            fixedOrderSources: product.sources || [],
            stockSources: stockData.stockSources || [],
            importedOnly: true,
            suggestion: calculateSuggestion(
              0,
              increasePercent,
              product.fixedQuantity,
              product.orderQuantity,
              stockData.stockQuantity,
              stockData.stockStatus
            ),
          };
        });

      return {
        ...currentProductsByStoreAndDay,
        [preview.storeName]: {
          ...(currentProductsByStoreAndDay[preview.storeName] || {}),
          [preview.day]: [...updatedProducts, ...addedProducts].sort(compareProductsByName),
        },
      };
    });

    setImportMessage(
      `Valores de ${preview.products.length} produto(s) adicionados ao acumulado de ${preview.storeName} em ${formatDate(preview.day)}.`
    );
    setImportPreview(null);
    setImportLoading(false);
  };

  const buildStoresPayloadForDay = (day) => Object.fromEntries(
    selectedStores
      .filter((storeName) => productsByStoreAndDay[storeName]?.[day])
      .map((storeName) => [
        storeName,
        {
          defaultIncreasePercent: toNullableNumber(defaultIncreaseByStoreAndDay[storeName]?.[day]),
          products: normalizeDayProducts(productsByStoreAndDay[storeName][day]),
        },
      ])
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasSuggested || !validatePlanningFilters() || calculationDirty || saveLoading) return;

    setSaveLoading(true);
    setProductsMessage("");
    try {
      if (isEditing) {
        const stores = buildStoresPayloadForDay(editingDayParam);
        if (!Object.keys(stores).length) return;
        await api.put(`/admin/production-planning/${editingDayParam}`, {
          comparisonStartDate,
          comparisonEndDate,
          updatedAt: editingUpdatedAt,
          stores,
        });
      } else {
        const storesByDay = Object.fromEntries(
          productionDays.map((day) => [day, buildStoresPayloadForDay(day)])
        );
        if (!Object.values(storesByDay).some((stores) => Object.keys(stores).length)) return;
        await api.post("/admin/production-planning", {
          servedStartDate,
          servedEndDate,
          comparisonStartDate,
          comparisonEndDate,
          storesByDay,
        });
      }
      navigate("/planejamento-producao");
    } catch (error) {
      const conflictDays = error.response?.data?.conflictDays;
      const conflictMessage = Array.isArray(conflictDays) && conflictDays.length
        ? ` Datas em conflito: ${conflictDays.map(formatDate).join(", ")}.`
        : "";
      setProductsMessage((error.response?.data?.error || "Não foi possível salvar o planejamento.") + conflictMessage);
    } finally {
      setSaveLoading(false);
    }
  };

  if (isEditing && !editLoading && editLoadError && !hasSuggested) {
    return (
      <section className="production-planning-page">
        <div className="production-planning-toolbar">
          <div>
            <h1>Editar planejamento de {formatDate(editingDayParam)}</h1>
          </div>
          <Link to="/planejamento-producao" className="button button--ghost">
            Voltar
          </Link>
        </div>
        <p className="form-message form-message--error" role="alert">{editLoadError}</p>
      </section>
    );
  }

  return (
    <section className="production-planning-page">
      {(suggestionLoading || importLoading || stockImportLoading || editLoading || saveLoading) && (
        <div
          className="production-suggestion-loading"
          role="status"
          aria-live="polite"
          aria-label="Carregando informações"
        >
          <div className="production-suggestion-loading__content">
            <span className="production-suggestion-loading__indicator" aria-hidden="true" />
            <p>Carregando informações...</p>
          </div>
        </div>
      )}
      <div className="production-planning-toolbar">
        <div>
          <h1>{isEditing ? `Editar planejamento de ${formatDate(editingDayParam)}` : "Novo Planejamento de produção"}</h1>
        </div>
        <Link to="/planejamento-producao" className="button button--ghost">
          Cancelar
        </Link>
      </div>

      {editLoadError && <p className="form-message form-message--error" role="alert">{editLoadError}</p>}

      <form className="production-form" onSubmit={handleSubmit}>
        <div className={`production-form-panel ${isHeaderCollapsed ? "production-form-panel--collapsed" : ""}`}>
          {isHeaderCollapsed ? (
            <button
              type="button"
              className="production-filter-toggle"
              onClick={() => setIsHeaderCollapsed(false)}
              aria-label="Mostrar filtros do planejamento"
              title="Mostrar filtros"
            >
              <span aria-hidden="true">⌄</span>
            </button>
          ) : (
            <div className={`production-form-grid production-form-grid--suggestion ${isEditing ? "production-form-grid--editing" : ""}`}>
              <label className="production-form-grid__period">
                <span>Período da produção</span>
                {isEditing ? (
                  <button type="button" className="production-range-input production-range-input--readonly" disabled>
                    <span>{formatDate(servedStartDate)} a {formatDate(servedEndDate)}</span>
                  </button>
                ) : (
                  <PeriodRangePicker
                    startDate={servedStartDate}
                    endDate={servedEndDate}
                    onChange={(nextStartDate, nextEndDate) => {
                      setServedStartDate(nextStartDate);
                      setServedEndDate(nextEndDate);
                    }}
                  />
                )}
              </label>
              <label className="production-form-grid__period">
                <span>Período de comparação</span>
                <PeriodRangePicker
                  startDate={comparisonStartDate}
                  endDate={comparisonEndDate}
                  isDateDisabled={isComparisonDateDisabled}
                  disabledHint="Selecione um período com os mesmos dias da semana do período da produção."
                  onChange={(nextStartDate, nextEndDate) => {
                    setComparisonStartDate(nextStartDate);
                    setComparisonEndDate(nextEndDate);
                    if (isEditing) setCalculationDirty(true);
                  }}
                />
              </label>
              <label className="production-form-grid__store">
                <span>Loja</span>
                <MultiStoreSelect stores={selectableProductionStores} selectedStores={selectedStores} onToggleStore={handleToggleStore} />
              </label>
              {!isEditing && (
                <div className="production-form-grid__stock-source">
                  <label>
                    <span>Origem do estoque</span>
                    <select value={stockSource} onChange={(event) => handleStockSourceChange(event.target.value)}>
                      <option value="everest">Estoque Everest</option>
                      <option value="faq">Último estoque do FAQ</option>
                      <option value="spreadsheet">Importar estoque</option>
                    </select>
                  </label>
                  {stockSource === "spreadsheet" && (
                    <div className="production-stock-source-import">
                      <input
                        ref={stockFileInputRef}
                        type="file"
                        accept=".txt,.xlsx,.xls,text/plain"
                        onChange={handleStockFileChange}
                        hidden
                      />
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => stockFileInputRef.current?.click()}
                        disabled={stockImportLoading}
                      >
                        {stockImportLoading ? "Lendo estoque..." : importedStock ? "Trocar arquivo" : "Selecionar arquivo"}
                      </button>
                      {importedStock?.fileName && <small title={importedStock.fileName}>{importedStock.fileName}</small>}
                    </div>
                  )}
                </div>
              )}
              <div className="production-form-grid__suggest">
                <span>Ação</span>
                <button
                  type="button"
                  className="button"
                  onClick={handleSuggestProduction}
                  disabled={suggestionLoading || storesLoading || !validatePlanningFilters() || (
                    !isEditing && stockSource === "spreadsheet" && !importedStock
                  )}
                >
                  {suggestionLoading || storesLoading
                    ? "Carregando dados..."
                    : isEditing ? "Recalcular produção" : "Sugerir produção"}
                </button>
              </div>
              {hasSuggested && (
                <div className="production-form-grid__collapse">
                  <button type="button" className="button button--ghost" onClick={() => setIsHeaderCollapsed(true)}>
                    Recolher filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {productsMessage && (
          <p className="form-message form-message--error">{productsMessage}</p>
        )}
        {stockWarnings.length > 0 && (
          <div className="production-stock-warning" role="status">
            <strong>{isEditing ? "Estoque preservado" : stockSourceLabels[stockSource]}</strong>
            {stockWarnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        {importMessage && (
          <p className="form-message production-import-message">{importMessage}</p>
        )}
        {stockImportWarning && (
          <p className="production-stock-warning" role="status">{stockImportWarning}</p>
        )}
        {isEditing && calculationDirty && (
          <p className="production-stock-warning" role="status">
            O período ou as lojas foram alterados. Recalcule a produção antes de salvar.
          </p>
        )}

        {hasSuggested && (
          <>
            <div className="production-view-tabs">
              {selectedStores.map((storeName) => (
                <button
                  key={storeName}
                  type="button"
                  className={activeStore === storeName ? "production-view-tabs__item--active" : ""}
                  onClick={() => {
                    setActiveStore(storeName);
                    setActiveDay(consolidatedTab);
                    setProductQuery("");
                    setFocusedPercentField("");
                  }}
                >
                  {storeName}
                </button>
              ))}
            </div>

            <div className="production-view-tabs production-day-tabs">
              <button
                type="button"
                className={isConsolidatedActive ? "production-view-tabs__item--active" : ""}
                onClick={() => {
                  setActiveDay(consolidatedTab);
                  setProductQuery("");
                  setFocusedPercentField("");
                }}
              >
                Consolidado
              </button>
              {activeStoreProductionDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={activeDay === day ? "production-view-tabs__item--active" : ""}
                  onClick={() => {
                    setActiveDay(day);
                    setProductQuery("");
                    setFocusedPercentField("");
                  }}
                >
                  {formatDate(day)}
                </button>
              ))}
            </div>

            <div className="production-store-controls">
              {!isConsolidatedActive ? (
                <label>
                  <span>% de aumento padrão do dia</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayPercent(defaultIncreaseByStoreAndDay[activeStore]?.[activeDay], focusedPercentField === "default")}
                    onFocus={() => setFocusedPercentField("default")}
                    onBlur={() => setFocusedPercentField("")}
                    onChange={handleDefaultIncreaseChange}
                  />
                </label>
              ) : (
                <div className="production-store-controls__read-only">
                  <strong>Consolidado da loja</strong>
                  <span>Somatório do período selecionado</span>
                </div>
              )}
              <div>
                <strong>{activeStore}</strong>
                <span>
                  {isConsolidatedActive ? "Produção consolidada" : `Produção de ${formatDate(activeDay)}`}
                </span>
              </div>
              {!isConsolidatedActive && (
                <div className="production-import-control">
                  <input
                    ref={fixedOrdersFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFixedOrdersFileChange}
                    hidden
                  />
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => fixedOrdersFileInputRef.current?.click()}
                    disabled={importLoading || stockImportLoading}
                  >
                    {importLoading ? "Lendo planilha..." : "Importar Fixos e Encomendas"}
                  </button>
                </div>
              )}
            </div>

            <div className="production-product-search">
              <label htmlFor="production-product-search">
                <span>Pesquisar itens</span>
                <input
                  id="production-product-search"
                  type="search"
                  placeholder="Código ou nome do produto"
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                />
              </label>
            </div>

            <div className="production-table-shell production-planning-entry-shell">
              <table className="production-table production-products-table production-planning-entry-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Média vendida</th>
                    <th>Dias atendidos</th>
                    <th>Quantidade em estoque</th>
                    <th>Fixos/Encomendas</th>
                    <th>{isConsolidatedActive ? "% aumento médio" : "% aumento"}</th>
                    <th>A ser enviado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.code}>
                      <td data-label="Código">{product.code}</td>
                      <td data-label="Nome">{product.name}</td>
                      <td data-label="Média vendida">{product.averageSold}</td>
                      <td data-label="Dias atendidos">
                        <ServedDates dates={product.servedDates} />
                      </td>
                      <td data-label="Quantidade em estoque"><StockQuantity product={product} /></td>
                      <td data-label="Fixos/Encomendas">{formatQuantity(getAdditionalQuantity(product))}</td>
                      <td data-label={isConsolidatedActive ? "% aumento médio" : "% aumento"}>
                        {isConsolidatedActive ? (
                          product.increasePercent === null ? "" : `${product.increasePercent}%`
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={displayPercent(product.increasePercent, focusedPercentField === `${activeDay}-${product.code}`)}
                            onFocus={() => setFocusedPercentField(`${activeDay}-${product.code}`)}
                            onBlur={() => setFocusedPercentField("")}
                            onChange={(event) => updateProduct(product.code, "increasePercent", event.target.value)}
                          />
                        )}
                      </td>
                      <td data-label="A ser enviado">
                        {isConsolidatedActive ? (
                          product.suggestion
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={product.suggestion}
                            onChange={(event) => updateProduct(product.code, "suggestion", event.target.value)}
                            required
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleProducts.length && (
                <p className="empty-state production-empty-state">Nenhum item encontrado.</p>
              )}
            </div>

            <div className="form-actions production-form-actions">
              <Link to="/planejamento-producao" className="button button--ghost">
                Cancelar
              </Link>
              <button type="submit" className="button" disabled={saveLoading || calculationDirty || Boolean(editLoadError)}>
                {saveLoading ? "Salvando..." : isEditing ? "Salvar alterações" : "Gerar produção"}
              </button>
            </div>
          </>
        )}
      </form>

      {importPreview && (
        <div className="modal-backdrop production-import-backdrop" onClick={closeImportPreview}>
          <div
            className="modal-card production-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="production-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <h3 id="production-import-title">Validar Fixos e Encomendas</h3>
                <p>{importPreview.storeName} | {formatDate(importPreview.day)}</p>
              </div>
              <button type="button" onClick={closeImportPreview} aria-label="Fechar">X</button>
            </div>

            <div className="production-import-summary">
              <span><strong>{importPreview.validLineCount}</strong> linhas válidas</span>
              <span><strong>{importPreview.products.length}</strong> produtos</span>
              <span><strong>{importPreview.ignoredCount}</strong> linhas ignoradas</span>
              <span title={importPreview.fileName}>{importPreview.fileName}</span>
            </div>

            <div className="production-import-table-shell">
              <table className="production-table production-import-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Fixos adicionados</th>
                    <th>Encomendas adicionadas</th>
                    <th>Acumulado atual</th>
                    <th>Total após confirmar</th>
                    <th>Situação</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.products.map((product) => {
                    const isRegistered = Boolean(product.registeredProduct);
                    const isRegistering = registeringProductCodes.includes(product.code);
                    const compositionTitle = (product.sources || []).map((source) =>
                      `${source.code}: ${formatQuantity(source.fixedQuantity + source.orderQuantity)} x ${formatQuantity(source.factor)}`
                    ).join(" | ");
                    return (
                      <tr key={product.code} className={isRegistered ? "" : "production-import-row--unknown"}>
                        <td>{product.code}</td>
                        <td title={compositionTitle}>{product.registeredProduct?.name || product.spreadsheetName}</td>
                        <td>{formatQuantity(product.fixedQuantity)}</td>
                        <td>{formatQuantity(product.orderQuantity)}</td>
                        <td>{formatQuantity(product.currentAdditionalQuantity)}</td>
                        <td title={compositionTitle}>{formatQuantity(product.nextAdditionalQuantity)}</td>
                        <td>
                          <span className={`production-import-status production-import-status--${isRegistered ? "registered" : "unknown"}`}>
                            {isRegistered ? "Cadastrado" : "Não cadastrado"}
                          </span>
                        </td>
                        <td>
                          {!isRegistered && (
                            <button
                              type="button"
                              className="button button--ghost production-import-register"
                              onClick={() => handleRegisterImportedProduct(product.code)}
                              disabled={isRegistering}
                            >
                              {isRegistering ? "Cadastrando..." : "Cadastrar produto"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="form-actions production-import-actions">
              <button type="button" className="button button--ghost" onClick={closeImportPreview}>
                Cancelar
              </button>
              <button
                type="button"
                className="button"
                onClick={handleValidateImport}
                disabled={importLoading || importPreview.products.some((product) => !product.registeredProduct) || registeringProductCodes.length > 0}
                title={importPreview.products.some((product) => !product.registeredProduct)
                  ? "Cadastre todos os produtos antes de validar."
                  : "Validar importação"}
              >
                {importLoading ? "Consultando estoque..." : "Validar importação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default NewProductionPlanning;
