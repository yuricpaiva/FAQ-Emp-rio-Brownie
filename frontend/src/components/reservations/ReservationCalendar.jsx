import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import SystemNotification from "../SystemNotification";
import {
  addDays,
  addMonths,
  formatDate,
  formatTime,
  fortalezaDate,
  localInstant,
  monthGrid,
  startOfMonth,
  startOfWeek,
} from "./reservationDates";

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit",
});
const monthFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC", month: "long", year: "numeric",
});
const monthWeekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function EventDetails({ event, detailed = false }) {
  return <article className={`reservation-event reservation-event--${event.kind.toLowerCase()}`}>
    <strong>{event.resource.name}</strong>
    <span>{event.resource.type.name}</span>
    <time>{event.resource.type.reservationMode === "PERIOD" ? "Dia inteiro" : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`}</time>
    <small>{event.kind === "BLOCK" ? "Indisponível" : event.mine ? "Sua reserva" : "Reservado"}</small>
    {detailed && event.user?.name && <p>Responsável: {event.user.name}</p>}
    {detailed && event.purpose && <p>Finalidade: {event.purpose}</p>}
    {detailed && event.reason && <p>Motivo: {event.reason}</p>}
  </article>;
}

export default function ReservationCalendar({ refreshToken, onNewReservation }) {
  const today = fortalezaDate();
  const [viewMode, setViewMode] = useState("month");
  const [anchor, setAnchor] = useState(today);
  const [motionDirection, setMotionDirection] = useState("none");
  const [selectedDay, setSelectedDay] = useState(null);
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = useMemo(() => {
    if (viewMode === "month") return monthGrid(anchor);
    const start = startOfWeek(anchor);
    return { start, end: addDays(start, 7), days: Array.from({ length: 7 }, (_, index) => addDays(start, index)) };
  }, [anchor, viewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ startAt: localInstant(range.start), endAt: localInstant(range.end) });
      if (typeId) params.set("typeId", typeId);
      const [calendarResponse, typeResponse] = await Promise.all([
        api.get(`/reservations?${params}`),
        types.length ? Promise.resolve(null) : api.get("/reservations/resource-types"),
      ]);
      setEvents(calendarResponse.data);
      if (typeResponse) setTypes(typeResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível carregar o calendário.");
    } finally {
      setLoading(false);
    }
  }, [range.end, range.start, typeId, types.length]);

  useEffect(() => { load(); }, [load, refreshToken]);
  useEffect(() => {
    if (!selectedDay) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setSelectedDay(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedDay]);

  const eventsForDay = useCallback((day) => {
    const start = new Date(localInstant(day)).getTime();
    const end = new Date(localInstant(addDays(day, 1))).getTime();
    return events.filter((event) => new Date(event.startAt).getTime() < end && new Date(event.endAt).getTime() > start);
  }, [events]);

  const changeView = (mode) => { setViewMode(mode); setMotionDirection("none"); setSelectedDay(null); };
  const navigate = (direction) => {
    setMotionDirection(direction > 0 ? "next" : "previous");
    setAnchor((current) => viewMode === "month"
      ? addMonths(current, direction)
      : addDays(current, direction * 7));
  };
  const goToday = () => { setAnchor(fortalezaDate()); setMotionDirection("none"); setSelectedDay(null); };
  const periodLabel = viewMode === "month"
    ? monthFormat.format(new Date(`${startOfMonth(anchor)}T00:00:00.000Z`))
    : `${formatDate(localInstant(range.start), { year: false })}–${formatDate(localInstant(addDays(range.end, -1)))}`;
  const selectedEvents = selectedDay ? eventsForDay(selectedDay) : [];

  return (
    <section className="reservation-section">
      <div className="reservation-toolbar">
        <div>
          <h2>Agenda {viewMode === "month" ? "mensal" : "semanal"}</h2>
          <p className="section-copy">Horários ocupados e bloqueios dos recursos compartilhados.</p>
          <strong className="reservation-calendar-period">{periodLabel}</strong>
        </div>
        <div className="reservation-toolbar__right">
          <div className="reservation-toolbar__view-actions">
            <button type="button" className="reservation-new-button" onClick={onNewReservation}>Nova reserva</button>
            <div className="reservation-view-switch" role="group" aria-label="Visualização do calendário">
              <button type="button" aria-pressed={viewMode === "week"} className={viewMode === "week" ? "active" : ""} onClick={() => changeView("week")}>Semana</button>
              <button type="button" aria-pressed={viewMode === "month"} className={viewMode === "month" ? "active" : ""} onClick={() => changeView("month")}>Mês</button>
            </div>
          </div>
          <div className="reservation-toolbar__actions">
            <select className="reservation-calendar-filter" value={typeId} onChange={(event) => setTypeId(event.target.value)} aria-label="Filtrar por tipo">
              <option value="">Todos os tipos</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
            <button type="button" className="button button--ghost reservation-calendar-arrow" aria-label={viewMode === "month" ? "Mês anterior" : "Semana anterior"} onClick={() => navigate(-1)}>←</button>
            <button type="button" className="button button--ghost reservation-calendar-today" onClick={goToday}>Hoje</button>
            <button type="button" className="button button--ghost reservation-calendar-arrow" aria-label={viewMode === "month" ? "Próximo mês" : "Próxima semana"} onClick={() => navigate(1)}>→</button>
          </div>
        </div>
      </div>
      {error && <SystemNotification variant="error">{error}</SystemNotification>}
      {loading ? <div className="reservation-empty">Carregando agenda...</div> : viewMode === "week" ? (
        <div key={`week-${range.start}`} className={`reservation-week reservation-calendar-motion reservation-calendar-motion--${motionDirection}`}>
          {range.days.map((day) => (
            <article key={day} className={`reservation-day ${day === today ? "reservation-day--today" : ""}`}>
              <h3>{weekdayFormat.format(new Date(`${day}T00:00:00.000Z`))}</h3>
              <div className="reservation-day__events">
                {eventsForDay(day).map((event) => <EventDetails key={`${event.kind}-${event.id}`} event={event} />)}
                {!eventsForDay(day).length && <span className="reservation-day__free">Sem ocupações</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div key={`month-${range.start}`} className={`reservation-month-wrap reservation-calendar-motion reservation-calendar-motion--${motionDirection}`}>
          <div className="reservation-month-weekdays" aria-hidden="true">{monthWeekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="reservation-month">
            {range.days.map((day) => {
              const dayEvents = eventsForDay(day);
              const outside = day.slice(0, 7) !== range.monthStart.slice(0, 7);
              return <button
                type="button"
                key={day}
                className={`reservation-month-day ${outside ? "reservation-month-day--outside" : ""} ${day === today ? "reservation-month-day--today" : ""} ${day === selectedDay ? "reservation-month-day--selected" : ""}`}
                aria-label={`${formatDate(localInstant(day))}: ${dayEvents.length} ocupação(ões)`}
                onClick={() => setSelectedDay(day)}
              >
                <time dateTime={day}>{Number(day.slice(-2))}</time>
                {!!dayEvents.length && <div className="reservation-month-indicators">
                  <span className="reservation-month-count">{dayEvents.length}</span>
                  <span className="reservation-month-dots">{dayEvents.slice(0, 5).map((event) => <i key={`${event.kind}-${event.id}`} className={`reservation-month-dot reservation-month-dot--${event.kind.toLowerCase()}`} />)}</span>
                </div>}
              </button>;
            })}
          </div>
        </div>
      )}

      {selectedDay && <div className="modal-backdrop" onClick={() => setSelectedDay(null)}>
        <div className="modal-card reservation-day-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-day-modal-title" onClick={(event) => event.stopPropagation()}>
          <div className="modal-card__header">
            <div><span className="reservation-eyebrow">Agenda do dia</span><h3 id="reservation-day-modal-title">{formatDate(localInstant(selectedDay), { weekday: "long" })}</h3></div>
            <button type="button" aria-label="Fechar detalhes do dia" onClick={() => setSelectedDay(null)}>×</button>
          </div>
          <div className="reservation-modal-events">
            {selectedEvents.map((event) => <EventDetails key={`${event.kind}-${event.id}`} event={event} detailed />)}
            {!selectedEvents.length && <div className="reservation-empty">Sem ocupações neste dia.</div>}
          </div>
        </div>
      </div>}
    </section>
  );
}
