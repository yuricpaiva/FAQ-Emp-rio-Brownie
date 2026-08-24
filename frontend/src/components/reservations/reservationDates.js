export const FORTALEZA_TIME_ZONE = "America/Fortaleza";

export function fortalezaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FORTALEZA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDays(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(dateText = fortalezaDate()) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  return addDays(dateText, weekday === 0 ? -6 : 1 - weekday);
}

export function startOfMonth(dateText = fortalezaDate()) {
  return `${dateText.slice(0, 7)}-01`;
}

export function addMonths(dateText, amount) {
  const date = new Date(`${startOfMonth(dateText)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

export function monthGrid(dateText = fortalezaDate()) {
  const monthStart = startOfMonth(dateText);
  const nextMonth = addMonths(monthStart, 1);
  const start = startOfWeek(monthStart);
  const lastDay = addDays(nextMonth, -1);
  const end = addDays(startOfWeek(lastDay), 7);
  const dayCount = Math.round((new Date(`${end}T00:00:00.000Z`) - new Date(`${start}T00:00:00.000Z`)) / 86400000);
  return {
    monthStart,
    start,
    end,
    days: Array.from({ length: dayCount }, (_, index) => addDays(start, index)),
  };
}

export function localInstant(date, time = "00:00") {
  return `${date}T${time}:00-03:00`;
}

export function formatDate(value, options = {}) {
  const { year = "numeric", ...intlOptions } = options;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FORTALEZA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: year === false ? undefined : year,
    ...intlOptions,
  }).format(new Date(value));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FORTALEZA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatInterval(item) {
  const startDate = fortalezaDate(new Date(item.startAt));
  const endExclusiveDate = fortalezaDate(new Date(item.endAt));
  if (item.resource?.type?.reservationMode === "PERIOD") {
    return `${formatDate(item.startAt)} até ${formatDate(localInstant(addDays(endExclusiveDate, -1)))}`;
  }
  return `${formatDate(item.startAt)} · ${formatTime(item.startAt)}–${formatTime(item.endAt)}`;
}
