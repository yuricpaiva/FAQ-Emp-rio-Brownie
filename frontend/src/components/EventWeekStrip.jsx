import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { addDays, eventOccursOn, isSameDay, startOfWeek, toIsoDate } from "../utils/calendarEvents";

const shortDay = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const monthDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function EventWeekStrip() {
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get("/events", { params: { from: toIsoDate(days[0]), to: toIsoDate(days[6]) } })
      .then((response) => { if (active) setEvents(response.data); })
      .catch(() => { if (active) setEvents([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  return (
    <section className="week-events" aria-labelledby="week-events-title">
      <header className="week-events__header">
        <div>
          <h2 id="week-events-title">Agenda da semana</h2>
          <p>Eventos de {monthDay.format(days[0])} a {monthDay.format(days[6])}</p>
        </div>
        <Link to="/eventos" className="week-events__link">
          Ver calendário <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <div className="week-events__days">
        {days.map((day) => {
          const isoDate = toIsoDate(day);
          const dayEvents = events.filter((event) => eventOccursOn(event, isoDate));
          return (
            <article className={`week-day ${isSameDay(day, new Date()) ? "week-day--today" : ""}`} key={isoDate}>
              <header>
                <span>{shortDay.format(day).replace(".", "")}</span>
                <strong>{day.getDate()}</strong>
              </header>
              <div className="week-day__content">
                {loading ? (
                  <span className="week-day__skeleton" aria-label="Carregando eventos" />
                ) : dayEvents.length ? (
                  dayEvents.slice(0, 3).map((event) => (
                    <Link to={`/eventos?data=${isoDate}`} className="week-event" key={`${isoDate}-${event.occurrenceId}`}>
                      <span><Clock size={12} aria-hidden="true" /> {event.time}</span>
                      <strong>{event.title}</strong>
                    </Link>
                  ))
                ) : (
                  <span className="week-day__empty">Sem eventos</span>
                )}
                {dayEvents.length > 3 && (
                  <Link to={`/eventos?data=${isoDate}`} className="week-day__more">
                    +{dayEvents.length - 3} {dayEvents.length - 3 === 1 ? "evento" : "eventos"}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !events.length && (
        <div className="week-events__empty">
          <CalendarDays size={18} aria-hidden="true" />
          <span>Nenhum evento programado para esta semana.</span>
        </div>
      )}
    </section>
  );
}

export default EventWeekStrip;
