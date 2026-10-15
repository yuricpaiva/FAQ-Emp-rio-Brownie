const DAY_MS = 24 * 60 * 60 * 1000;

export function fromIsoDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date) {
  const result = new Date(date);
  const weekday = result.getDay();
  result.setDate(result.getDate() - (weekday === 0 ? 6 : weekday - 1));
  result.setHours(12, 0, 0, 0);
  return result;
}

export function startOfCalendarGrid(monthDate) {
  return startOfWeek(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12));
}

export function isSameDay(left, right) {
  return toIsoDate(left) === toIsoDate(right);
}

export function eventOccursOn(event, isoDate) {
  return event.occurrenceStartDate <= isoDate && event.occurrenceEndDate >= isoDate;
}

export function formatDateRange(event, options = {}) {
  const start = fromIsoDate(event.occurrenceStartDate || event.startDate);
  const end = fromIsoDate(event.occurrenceEndDate || event.endDate);
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: options.long ? "long" : "short",
  });
  if (toIsoDate(start) === toIsoDate(end)) return formatter.format(start);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function recurrenceLabel(value) {
  return {
    NONE: "Não se repete",
    DAILY: "Todos os dias",
    WEEKLY: "Toda semana",
    MONTHLY: "Todo mês",
  }[value] || "Não se repete";
}

export function dateDifferenceInDays(start, end) {
  return Math.round((fromIsoDate(end) - fromIsoDate(start)) / DAY_MS);
}
