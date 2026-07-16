import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getMockProductionDay,
  updateMockProductionDay,
  upsertMockProductionPlanForRange,
} from "../data/productionPlanningMock";
import api from "../services/api";

const today = new Date().toISOString().slice(0, 10);
const calendarWeekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const allWeekdays = [0, 1, 2, 3, 4, 5, 6];
const initialDefaultIncreasePercent = "";
const consolidatedTab = "consolidado";
const fixedNature = "VENDA NACIONAL";
const orderNature = "ENCOMENDA - CUPOM FISCAL";

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

function sanitizeDecimal(value) {
  const cleanValue = value.replace("%", "").replace(",", ".").replace(/[^\d.]/g, "");
  const [integerPart, ...decimalParts] = cleanValue.split(".");
  return decimalParts.length ? `${integerPart}.${decimalParts.join("")}` : integerPart;
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
  return products.map((product) => ({
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
  }));
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

  return Array.from(productMap.values()).map((product) => ({
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
  }));
}

function NewProductionPlanning() {
  const navigate = useNavigate();
  const fixedOrdersFileInputRef = useRef(null);
  const { day: editingDayParam } = useParams();
  const editingDay = editingDayParam ? getMockProductionDay(editingDayParam) : null;
  const isEditing = Boolean(editingDay);
  const savedStores = editingDay ? Object.keys(editingDay.stores) : [];
  const initialSelectedStores = savedStores.length ? savedStores : [];
  const [servedStartDate, setServedStartDate] = useState(editingDay?.day || today);
  const [servedEndDate, setServedEndDate] = useState(editingDay?.day || today);
  const [comparisonStartDate, setComparisonStartDate] = useState(editingDay?.comparisonStartDate || today);
  const [comparisonEndDate, setComparisonEndDate] = useState(editingDay?.comparisonEndDate || today);
  const [selectedStores, setSelectedStores] = useState(initialSelectedStores);
  const [activeStore, setActiveStore] = useState(initialSelectedStores[0] || "");
  const [activeDay, setActiveDay] = useState(consolidatedTab);
  const [productsByStoreAndDay, setProductsByStoreAndDay] = useState(() => (
    editingDay
      ? Object.fromEntries(
          Object.entries(editingDay.stores).map(([storeName, storeProduction]) => [
            storeName,
            {
              [editingDay.day]: normalizeProducts(storeProduction.products),
            },
          ])
        )
      : {}
  ));
  const [defaultIncreaseByStoreAndDay, setDefaultIncreaseByStoreAndDay] = useState(() => (
    editingDay
      ? Object.fromEntries(
          Object.entries(editingDay.stores).map(([storeName, storeProduction]) => [
            storeName,
            {
              [editingDay.day]: storeProduction.defaultIncreasePercent === null || storeProduction.defaultIncreasePercent === undefined
                ? ""
                : String(storeProduction.defaultIncreasePercent),
            },
          ])
        )
      : Object.fromEntries(initialSelectedStores.map((storeName) => [storeName, {}]))
  ));
  const [focusedPercentField, setFocusedPercentField] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [hasSuggested, setHasSuggested] = useState(isEditing);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(isEditing);
  const [productionStores, setProductionStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [productsMessage, setProductsMessage] = useState("");
  const [stockWarnings, setStockWarnings] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importLoading, setImportLoading] = useState(false);
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
    if (!productionRangeRule || !comparisonStartDate || !comparisonEndDate) return;

    const comparisonMatches =
      toLocalDate(comparisonStartDate).getDay() === productionRangeRule.startWeekday &&
      toLocalDate(comparisonEndDate).getDay() === productionRangeRule.endWeekday &&
      dateDiffInDays(comparisonStartDate, comparisonEndDate) === productionRangeRule.durationDays;

    if (!comparisonMatches) {
      setComparisonStartDate("");
      setComparisonEndDate("");
    }
  }, [comparisonEndDate, comparisonStartDate, productionRangeRule]);

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

    return (
      toLocalDate(comparisonStartDate).getDay() === productionRangeRule.startWeekday &&
      toLocalDate(comparisonEndDate).getDay() === productionRangeRule.endWeekday &&
      dateDiffInDays(comparisonStartDate, comparisonEndDate) === productionRangeRule.durationDays
    );
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
  };

  const handleSuggestProduction = async () => {
    if (!validatePlanningFilters()) return;

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
        stores: selectedStores.map((storeName) => ({
          displayName: storeName,
          days: getProductionDaysForStore(storeName).map((day) => ({
            day,
          })),
        })),
      });

      setProductsByStoreAndDay(Object.fromEntries(
        Object.entries(response.data?.stores || {}).map(([storeName, productsByDay]) => [
          storeName,
          Object.fromEntries(
            Object.entries(productsByDay).map(([day, products]) => [day, normalizeProducts(products)])
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
    } catch (error) {
      setProductsMessage(error.response?.data?.error || "Não foi possível sugerir a produção.");
    } finally {
      setSuggestionLoading(false);
    }
  };

  const updateProduct = (code, field, value) => {
    if (isConsolidatedActive) return;
    const nextValue = sanitizeDecimal(value);
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
    const nextValue = sanitizeDecimal(event.target.value);
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
      const catalogByCode = new Map(
        (catalogResponse.data || []).map((product) => [String(product.code).trim(), product])
      );

      setImportPreview({
        storeName: importStore,
        day: importDay,
        fileName: file.name,
        validLineCount: parsed.validLineCount,
        ignoredCount: parsed.ignoredCount,
        products: parsed.products.map((product) => ({
          ...product,
          registeredProduct: catalogByCode.get(product.code) || null,
        })),
      });
    } catch (error) {
      setProductsMessage(error.response?.data?.error || error.message || "Nao foi possivel importar a planilha.");
    } finally {
      setImportLoading(false);
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
      const currentDayProducts = (currentProductsByStoreAndDay[preview.storeName]?.[preview.day] || [])
        .filter((product) => !product.importedOnly || importedByCode.has(String(product.code)));
      const existingCodes = new Set(currentDayProducts.map((product) => String(product.code)));
      const updatedProducts = currentDayProducts.map((product) => {
        const importedProduct = importedByCode.get(String(product.code));
        const fixedQuantity = importedProduct?.fixedQuantity || 0;
        const orderQuantity = importedProduct?.orderQuantity || 0;
        const stockData = importedProduct ? stockByCode[String(product.code)] || {} : {};
        const nextProduct = { ...product, ...stockData, fixedQuantity, orderQuantity };
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
          [preview.day]: [...updatedProducts, ...addedProducts]
            .sort((left, right) => String(left.code).localeCompare(String(right.code), "pt-BR", { numeric: true })),
        },
      };
    });

    setImportMessage(
      `${preview.products.length} produto(s) importado(s) para ${preview.storeName} em ${formatDate(preview.day)}.`
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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!hasSuggested || !validatePlanningFilters()) return;

    if (isEditing) {
      const stores = buildStoresPayloadForDay(editingDayParam);
      if (!Object.keys(stores).length) return;

      updateMockProductionDay(editingDayParam, {
        comparisonStartDate,
        comparisonEndDate,
        stores,
      });
    } else {
      const storesByDay = Object.fromEntries(
        productionDays.map((day) => [day, buildStoresPayloadForDay(day)])
      );
      if (!Object.values(storesByDay).some((stores) => Object.keys(stores).length)) return;

      upsertMockProductionPlanForRange({
        productionDate: servedStartDate,
        servedStartDate,
        servedEndDate,
        comparisonStartDate,
        comparisonEndDate,
        storesByDay,
      });
    }

    navigate("/planejamento-producao");
  };

  return (
    <section className="production-planning-page">
      {(suggestionLoading || importLoading) && (
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
          <h1>Novo Planejamento de produção</h1>
        </div>
        <Link to="/planejamento-producao" className="button button--ghost">
          Cancelar
        </Link>
      </div>

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
            <div className="production-form-grid production-form-grid--suggestion">
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
                  }}
                />
              </label>
              <label className="production-form-grid__store">
                <span>Loja</span>
                <MultiStoreSelect stores={productionStores} selectedStores={selectedStores} onToggleStore={handleToggleStore} />
              </label>
              <div className="production-form-grid__suggest">
                <span>Ação</span>
                <button
                  type="button"
                  className="button"
                  onClick={handleSuggestProduction}
                  disabled={suggestionLoading || storesLoading || !validatePlanningFilters()}
                >
                  {suggestionLoading || storesLoading ? "Carregando dados..." : "Sugerir produção"}
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
            <strong>Estoque do Everest</strong>
            {stockWarnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        {importMessage && (
          <p className="form-message production-import-message">{importMessage}</p>
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
                    disabled={importLoading}
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
                    <th>A produzir</th>
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
                      <td data-label="A produzir">
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
              <button type="submit" className="button">
                Gerar produção
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
                    <th>Fixos</th>
                    <th>Encomendas</th>
                    <th>Total adicional</th>
                    <th>Situação</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.products.map((product) => {
                    const isRegistered = Boolean(product.registeredProduct);
                    const isRegistering = registeringProductCodes.includes(product.code);
                    return (
                      <tr key={product.code} className={isRegistered ? "" : "production-import-row--unknown"}>
                        <td>{product.code}</td>
                        <td>{product.registeredProduct?.name || product.spreadsheetName}</td>
                        <td>{formatQuantity(product.fixedQuantity)}</td>
                        <td>{formatQuantity(product.orderQuantity)}</td>
                        <td>{formatQuantity(product.fixedQuantity + product.orderQuantity)}</td>
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
