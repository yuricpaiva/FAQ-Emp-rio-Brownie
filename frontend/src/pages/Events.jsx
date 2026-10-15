import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import {
  addDays,
  eventOccursOn,
  formatDateRange,
  fromIsoDate,
  isSameDay,
  recurrenceLabel,
  startOfCalendarGrid,
  toIsoDate,
} from "../utils/calendarEvents";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const selectedDateFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

function initialForm(date) {
  const isoDate = toIsoDate(date);
  return {
    title: "",
    description: "",
    startDate: isoDate,
    endDate: isoDate,
    time: "09:00",
    imageUrl: "",
    recurrence: "NONE",
    recurrenceEndDate: isoDate,
    allUsersParticipants: true,
    participants: [],
  };
}

function Events() {
  const { user, hasRole } = useAuth();
  const { confirm } = useSystemNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDate = searchParams.get("data");
  const parsedRequestedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "") ? fromIsoDate(requestedDate) : null;
  const initialDate = parsedRequestedDate && !Number.isNaN(parsedRequestedDate.getTime()) ? parsedRequestedDate : new Date();
  const [month, setMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(initialDate));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => initialForm(initialDate));
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const canManage = hasRole(["creator", "admin"]);
  const isAdmin = hasRole(["admin"]);

  const gridStart = useMemo(() => startOfCalendarGrid(month), [month]);
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)), [gridStart]);
  const range = useMemo(() => ({ from: toIsoDate(gridDays[0]), to: toIsoDate(gridDays[41]) }), [gridDays]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/events", { params: range });
      setEvents(response.data);
    } catch (requestError) {
      setEvents([]);
      setError(requestError.response?.data?.error || "Não foi possível carregar os eventos.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    const query = userQuery.trim();
    if (!editorOpen || form.allUsersParticipants || query.length < 2) {
      setUserResults([]);
      setSearchingUsers(false);
      return undefined;
    }

    let active = true;
    setSearchingUsers(true);
    const timeout = window.setTimeout(async () => {
      try {
        const response = await api.get("/events/users", { params: { q: query } });
        if (active) {
          const selectedIds = new Set(form.participants.map((participant) => participant.id));
          setUserResults(response.data.filter((candidate) => !selectedIds.has(candidate.id)));
        }
      } catch {
        if (active) setUserResults([]);
      } finally {
        if (active) setSearchingUsers(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [editorOpen, form.allUsersParticipants, form.participants, userQuery]);

  const selectedEvents = useMemo(
    () => events.filter((event) => eventOccursOn(event, selectedDate)),
    [events, selectedDate],
  );

  const selectDate = (date) => {
    const isoDate = toIsoDate(date);
    setSelectedDate(isoDate);
    setSearchParams({ data: isoDate }, { replace: true });
    setEditorOpen(false);
  };

  const moveMonth = (amount) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
    setMonth(next);
    selectDate(next);
  };

  const goToday = () => {
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    selectDate(today);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm(fromIsoDate(selectedDate)));
    setImageFile(null);
    setUserQuery("");
    setUserResults([]);
    setMessage("");
    setError("");
    setEditorOpen(true);
  };

  const openEdit = (event) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      time: event.time,
      imageUrl: event.imageUrl,
      recurrence: event.recurrence,
      recurrenceEndDate: event.recurrenceEndDate || event.startDate,
      allUsersParticipants: event.allUsersParticipants,
      participants: event.participants || [],
    });
    setImageFile(null);
    setUserQuery("");
    setUserResults([]);
    setMessage("");
    setError("");
    setEditorOpen(true);
  };

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "startDate" && current.endDate < value) next.endDate = value;
      if (field === "startDate" && current.recurrenceEndDate < value) next.recurrenceEndDate = value;
      return next;
    });
  };

  const toggleAllParticipants = (checked) => {
    setForm((current) => ({
      ...current,
      allUsersParticipants: checked,
      participants: checked ? [] : current.participants,
    }));
    setUserQuery("");
    setUserResults([]);
  };

  const addParticipant = (participant) => {
    setForm((current) => ({
      ...current,
      participants: current.participants.some((item) => item.id === participant.id)
        ? current.participants
        : [...current.participants, participant],
    }));
    setUserQuery("");
    setUserResults([]);
  };

  const removeParticipant = (participantId) => {
    setForm((current) => ({
      ...current,
      participants: current.participants.filter((participant) => participant.id !== participantId),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append("file", imageFile);
        const upload = await api.post("/admin/uploads", uploadData, { headers: { "Content-Type": "multipart/form-data" } });
        imageUrl = upload.data.url;
      }
      const payload = {
        ...form,
        imageUrl,
        participantIds: form.participants.map((participant) => participant.id),
      };
      delete payload.participants;
      if (editingId) {
        await api.put(`/events/${editingId}`, payload);
      } else {
        await api.post("/events", payload);
      }
      setMessage(editingId ? "Evento atualizado com sucesso." : "Evento cadastrado com sucesso.");
      setEditorOpen(false);
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível salvar o evento.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (event) => {
    const confirmed = await confirm(`Excluir o evento “${event.title}” e todas as suas repetições?`, {
      title: "Excluir evento",
      confirmLabel: "Excluir",
    });
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`/events/${event.id}`);
      setMessage("Evento excluído.");
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível excluir o evento.");
    }
  };

  return (
    <section className="events-page page-stack">
      <header className="events-page__header">
        <div>
          <h1>Calendário de eventos</h1>
          <p>Acompanhe encontros, campanhas e datas importantes do Empório Brownie.</p>
        </div>
        {canManage && (
          <button type="button" className="button events-page__new" onClick={openCreate}>
            <Plus size={17} aria-hidden="true" /> Cadastrar evento
          </button>
        )}
      </header>

      {error && <SystemNotification variant="error">{error}</SystemNotification>}
      {message && <SystemNotification variant="success">{message}</SystemNotification>}

      <div className="events-layout">
        <section className="event-calendar" aria-label="Calendário mensal">
          <header className="event-calendar__toolbar">
            <div className="event-calendar__navigation">
              <button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={19} /></button>
              <h2>{monthFormatter.format(month)}</h2>
              <button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês"><ChevronRight size={19} /></button>
            </div>
            <button type="button" className="event-calendar__today" onClick={goToday}>Hoje</button>
          </header>

          <div className="event-calendar__weekdays" aria-hidden="true">
            {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className={`event-calendar__grid ${loading ? "event-calendar__grid--loading" : ""}`}>
            {gridDays.map((day) => {
              const isoDate = toIsoDate(day);
              const dayEvents = events.filter((event) => eventOccursOn(event, isoDate));
              const outside = day.getMonth() !== month.getMonth();
              return (
                <button
                  type="button"
                  key={isoDate}
                  className={[
                    "event-calendar__day",
                    outside ? "event-calendar__day--outside" : "",
                    isSameDay(day, new Date()) ? "event-calendar__day--today" : "",
                    selectedDate === isoDate ? "event-calendar__day--selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => selectDate(day)}
                  aria-pressed={selectedDate === isoDate}
                  aria-label={`${selectedDateFormatter.format(day)}, ${dayEvents.length} eventos`}
                >
                  <time dateTime={isoDate}>{day.getDate()}</time>
                  <span className="event-calendar__items">
                    {dayEvents.slice(0, 2).map((calendarEvent) => (
                      <span className="event-calendar__item" key={`${isoDate}-${calendarEvent.occurrenceId}`}>
                        <i aria-hidden="true" />
                        <span>{calendarEvent.time} {calendarEvent.title}</span>
                      </span>
                    ))}
                    {dayEvents.length > 2 && <small>+{dayEvents.length - 2} eventos</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="event-agenda" aria-live="polite">
          {editorOpen ? (
            <form className="event-editor" onSubmit={handleSubmit}>
              <header>
                <div>
                  <h2>{editingId ? "Editar evento" : "Novo evento"}</h2>
                  <p>Preencha as informações que aparecerão no calendário.</p>
                </div>
                <button type="button" className="event-editor__close" onClick={() => setEditorOpen(false)} aria-label="Fechar formulário"><X size={18} /></button>
              </header>

              <label><span>Título</span><input value={form.title} onChange={(event) => updateField("title", event.target.value)} maxLength={160} required /></label>
              <label><span>Descrição</span><textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={4} maxLength={5000} required /></label>
              <div className="event-editor__row">
                <label><span>Data inicial</span><input type="date" value={form.startDate} onChange={(event) => updateField("startDate", event.target.value)} required /></label>
                <label><span>Data final</span><input type="date" min={form.startDate} value={form.endDate} onChange={(event) => updateField("endDate", event.target.value)} required /></label>
              </div>
              <label><span>Horário</span><input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} required /></label>
              <label>
                <span>Repetição</span>
                <select value={form.recurrence} onChange={(event) => updateField("recurrence", event.target.value)}>
                  <option value="NONE">Não se repete</option>
                  <option value="DAILY">Todos os dias</option>
                  <option value="WEEKLY">Toda semana</option>
                  <option value="MONTHLY">Todo mês</option>
                </select>
              </label>
              {form.recurrence !== "NONE" && (
                <label><span>Repetir até</span><input type="date" min={form.startDate} value={form.recurrenceEndDate} onChange={(event) => updateField("recurrenceEndDate", event.target.value)} required /></label>
              )}
              <fieldset className="event-editor__participants">
                <legend>Participantes</legend>
                <label className="event-participant-toggle">
                  <input
                    type="checkbox"
                    checked={form.allUsersParticipants}
                    onChange={(event) => toggleAllParticipants(event.target.checked)}
                  />
                  <span>
                    <strong>Todos os usuários são participantes</strong>
                    <small>Desmarque para escolher pessoas específicas.</small>
                  </span>
                </label>

                {!form.allUsersParticipants && (
                  <div className="event-participant-picker">
                    <label htmlFor="event-participant-search">Pesquisar usuários</label>
                    <div className="event-participant-search">
                      <Search size={16} aria-hidden="true" />
                      <input
                        id="event-participant-search"
                        type="search"
                        value={userQuery}
                        onChange={(event) => setUserQuery(event.target.value)}
                        placeholder="Digite nome ou e-mail"
                        autoComplete="off"
                      />
                    </div>
                    {userQuery.trim().length > 0 && userQuery.trim().length < 2 && (
                      <small className="event-participant-help">Digite pelo menos 2 caracteres.</small>
                    )}
                    {userQuery.trim().length >= 2 && (
                      <div className="event-participant-results" aria-live="polite">
                        {searchingUsers ? (
                          <span>Pesquisando usuários...</span>
                        ) : userResults.length ? userResults.map((candidate) => (
                          <button type="button" key={candidate.id} onClick={() => addParticipant(candidate)}>
                            <span className="event-participant-avatar" aria-hidden="true">
                              {candidate.photoUrl ? <img src={candidate.photoUrl} alt="" /> : candidate.name.slice(0, 1).toUpperCase()}
                            </span>
                            <span><strong>{candidate.name}</strong><small>{candidate.email}</small></span>
                            <UserPlus size={16} aria-hidden="true" />
                          </button>
                        )) : (
                          <span>Nenhum usuário disponível para esta busca.</span>
                        )}
                      </div>
                    )}

                    <div className="event-participant-selection">
                      <span>{form.participants.length ? `${form.participants.length} selecionado${form.participants.length === 1 ? "" : "s"}` : "Nenhum participante selecionado"}</span>
                      {form.participants.map((participant) => (
                        <div key={participant.id}>
                          <span><strong>{participant.name}</strong><small>{participant.email}</small></span>
                          <button type="button" onClick={() => removeParticipant(participant.id)} aria-label={`Remover ${participant.name}`}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
              <label className="event-editor__image">
                <span>Imagem <small>opcional</small></span>
                <span className="event-editor__file"><ImageIcon size={17} />{imageFile?.name || (form.imageUrl ? "Trocar imagem" : "Escolher imagem")}</span>
                <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
                <small className="event-editor__image-hint">Recomendado: 1600 × 700 px (proporção 16:7), JPG ou PNG, até 5 MB.</small>
              </label>
              {form.imageUrl && !imageFile && (
                <button type="button" className="event-editor__remove-image" onClick={() => updateField("imageUrl", "")}>Remover imagem atual</button>
              )}
              <div className="event-editor__actions">
                <button type="button" className="button button--ghost" onClick={() => setEditorOpen(false)}>Cancelar</button>
                <button type="submit" className="button" disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar evento"}</button>
              </div>
            </form>
          ) : (
            <>
              <header className="event-agenda__header">
                <div>
                  <span>Agenda do dia</span>
                  <h2>{selectedDateFormatter.format(fromIsoDate(selectedDate))}</h2>
                </div>
                <strong>{selectedEvents.length}</strong>
              </header>
              <div className="event-agenda__list">
                {loading ? (
                  <><span className="event-agenda__skeleton" /><span className="event-agenda__skeleton" /></>
                ) : selectedEvents.length ? selectedEvents.map((event) => {
                  const canEditEvent = isAdmin || event.createdBy?.id === user?.id;
                  return (
                  <article className="event-agenda__item" key={event.occurrenceId}>
                    {event.imageUrl && <img src={event.imageUrl} alt="" />}
                    <div className="event-agenda__item-body">
                      <div className="event-agenda__time"><Clock size={14} /> <time>{event.time}</time></div>
                      <h3>{event.title}</h3>
                      <p>{event.description}</p>
                      <div className="event-agenda__meta">
                        <span><CalendarDays size={13} /> {formatDateRange(event)}</span>
                        {event.recurrence !== "NONE" && <span><Repeat2 size={13} /> {recurrenceLabel(event.recurrence)}</span>}
                        <span><Users size={13} /> {event.allUsersParticipants ? "Todos os usuários" : `${event.participants.length} participante${event.participants.length === 1 ? "" : "s"}`}</span>
                      </div>
                      {canEditEvent && (
                        <div className="event-agenda__actions">
                          <button type="button" onClick={() => openEdit(event)}><Pencil size={14} /> Editar</button>
                          <button type="button" className="event-agenda__delete" onClick={() => handleDelete(event)}><Trash2 size={14} /> Excluir</button>
                        </div>
                      )}
                    </div>
                  </article>
                  );
                }) : (
                  <div className="event-agenda__empty">
                    <CalendarDays size={26} aria-hidden="true" />
                    <h3>Nenhum evento neste dia</h3>
                    <p>Selecione outra data no calendário{canManage ? " ou cadastre um novo evento" : ""}.</p>
                    {canManage && <button type="button" className="button button--ghost" onClick={openCreate}><Plus size={16} /> Cadastrar evento</button>}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

export default Events;
