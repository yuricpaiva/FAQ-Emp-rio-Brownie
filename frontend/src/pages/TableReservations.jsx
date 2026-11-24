import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronRight, Clock3, Mail, MapPin, Phone, Plus, Users, Utensils, X } from "lucide-react";
import AccessibleDialog from "../components/AccessibleDialog";
import SystemNotification from "../components/SystemNotification";
import api from "../services/api";
import "../styles/table-reservations.css";

const EMPTY_SUMMARY = { reservations: 0, expectedPeople: 0, checkedInPeople: 0 };
const statusLabels = { CONFIRMADA: "Confirmada", COMPARECEU: "Compareceu" };

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function tableNames(tables) {
  return tables?.length ? tables.map((table) => table.name).join(", ") : "—";
}

function maskBrazilianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const areaCode = `(${digits.slice(0, 2)})`;
  const number = digits.slice(2);
  if (number.length <= 4) return `${areaCode} ${number}`;
  const firstPartLength = number.length > 8 ? 5 : 4;
  return `${areaCode} ${number.slice(0, firstPartLength)}-${number.slice(firstPartLength)}`;
}

function SummaryStrip({ summary }) {
  return <section className="table-reservation-summary" aria-label="Resumo do dia">
    <div><span>Reservas</span><strong>{summary.reservations}</strong></div>
    <div><span>Pessoas previstas</span><strong>{summary.expectedPeople}</strong></div>
    <div><span>Pessoas que compareceram</span><strong>{summary.checkedInPeople}</strong></div>
  </section>;
}

function NewReservationDialog({ units, initialUnitId, initialDate, onClose, onCreated }) {
  const [form, setForm] = useState({
    unitId: String(initialUnitId || ""), reservationDate: initialDate, reservationTime: "",
    customerName: "", customerEmail: "", customerPhone: "", peopleCount: "1",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await api.post("/table-reservations", {
        ...form, unitId: Number(form.unitId), peopleCount: Number(form.peopleCount),
      });
      onCreated(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível salvar a reserva. Revise os dados e tente novamente.");
    } finally { setSaving(false); }
  };

  return <AccessibleDialog labelId="new-table-reservation-title" onClose={onClose} className="table-reservation-dialog" backdropClassName="table-reservation-backdrop">
    <div className="modal-card__header">
      <div><h2 id="new-table-reservation-title">Nova reserva</h2><p>Cadastre o cliente agora. A loja definirá as mesas no atendimento.</p></div>
      <button type="button" onClick={onClose} aria-label="Fechar nova reserva"><X size={19} /></button>
    </div>
    <form className="table-reservation-form" onSubmit={submit}>
      {error && <SystemNotification variant="error">{error}</SystemNotification>}
      <div className="table-reservation-form__context">
        <label><span>Unidade</span><select value={form.unitId} onChange={(event) => update("unitId", event.target.value)} required><option value="">Selecione</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label><span>Data</span><input type="date" min={localDateValue()} value={form.reservationDate} onChange={(event) => update("reservationDate", event.target.value)} required /></label>
        <label><span>Horário</span><input type="time" value={form.reservationTime} onChange={(event) => update("reservationTime", event.target.value)} required /></label>
      </div>
      <label><span>Nome completo</span><input maxLength="160" autoComplete="name" value={form.customerName} onChange={(event) => update("customerName", event.target.value)} required /></label>
      <label><span>E-mail</span><input type="email" maxLength="254" autoComplete="email" value={form.customerEmail} onChange={(event) => update("customerEmail", event.target.value)} required /></label>
      <label><span>Número do cliente</span><input type="tel" inputMode="tel" maxLength="15" autoComplete="tel" placeholder="(85) 99999-9999" value={form.customerPhone} onChange={(event) => update("customerPhone", maskBrazilianPhone(event.target.value))} required /></label>
      <label><span>Quantidade de pessoas</span><input type="number" min="1" max="500" inputMode="numeric" value={form.peopleCount} onChange={(event) => update("peopleCount", event.target.value)} required /></label>
      <div className="table-reservation-form__actions"><button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button" disabled={saving}>{saving ? "Salvando..." : "Criar reserva"}</button></div>
    </form>
  </AccessibleDialog>;
}

function ReservationDetailDialog({ reservationId, capabilities, onClose, onChanged }) {
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("detail");
  const [tables, setTables] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get(`/table-reservations/${reservationId}`)
      .then((response) => { if (active) setReservation(response.data); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.error || "Não foi possível carregar os detalhes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reservationId]);

  const openCheckIn = async () => {
    setError(""); setMode("check-in");
    try { setTables((await api.get("/table-reservations/tables", { params: { unitId: reservation.unitId } })).data); }
    catch (requestError) { setError(requestError.response?.data?.error || "Não foi possível carregar as mesas."); }
  };

  const toggleTable = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const confirmCheckIn = async (event) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await api.post(`/table-reservations/${reservation.id}/check-in`, { tableIds: selectedIds });
      setReservation(response.data); setMode("detail"); onChanged(response.data);
    } catch (requestError) { setError(requestError.response?.data?.error || "Não foi possível confirmar o comparecimento."); }
    finally { setSaving(false); }
  };

  return <AccessibleDialog labelId="table-reservation-detail-title" onClose={onClose} className="table-reservation-dialog table-reservation-detail-dialog" backdropClassName="table-reservation-backdrop">
    <div className="modal-card__header">
      <div><h2 id="table-reservation-detail-title">{mode === "check-in" ? "Confirmar comparecimento" : "Detalhes da reserva"}</h2>{reservation && <p>{reservation.unit.name} · {formatDate(reservation.reservationDate)} às {reservation.reservationTime}</p>}</div>
      <button type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={19} /></button>
    </div>
    {error && <SystemNotification variant="error">{error}</SystemNotification>}
    {loading && <div className="table-reservation-dialog__loading">Carregando detalhes...</div>}
    {!loading && reservation && mode === "detail" && <>
      <div className="table-reservation-detail__lead">
        <div>
          <span>Cliente</span>
          <strong>{reservation.customerName}</strong>
          <a href={`mailto:${reservation.customerEmail}`}><Mail size={15} />{reservation.customerEmail}</a>
          {reservation.customerPhone
            ? <a href={`tel:${reservation.customerPhone}`}><Phone size={15} />{maskBrazilianPhone(reservation.customerPhone)}</a>
            : <span className="table-reservation-detail__contact-empty"><Phone size={15} />Telefone não informado</span>}
        </div>
        <span className={`table-reservation-status table-reservation-status--${reservation.status.toLowerCase()}`}>{statusLabels[reservation.status] || reservation.status}</span>
      </div>
      <dl className="table-reservation-detail__grid">
        <div><dt>Data e horário</dt><dd>{formatDate(reservation.reservationDate)}, {reservation.reservationTime}</dd></div>
        <div><dt>Pessoas</dt><dd>{reservation.peopleCount}</dd></div>
        <div><dt>Unidade</dt><dd>{reservation.unit.name}</dd></div>
        <div><dt>Mesas utilizadas</dt><dd>{tableNames(reservation.tables)}</dd></div>
        <div><dt>Cadastrada por</dt><dd>{reservation.createdBy.name}</dd></div>
        <div><dt>Cadastro</dt><dd>{formatDateTime(reservation.createdAt)}</dd></div>
        {reservation.checkedInAt && <div><dt>Comparecimento</dt><dd>{formatDateTime(reservation.checkedInAt)}</dd></div>}
        {reservation.checkedInBy && <div><dt>Confirmado por</dt><dd>{reservation.checkedInBy.name}</dd></div>}
      </dl>
      <div className="table-reservation-detail__actions"><button type="button" className="button button--ghost" onClick={onClose}>Fechar</button>{reservation.status === "CONFIRMADA" && capabilities.canCheckIn && <button type="button" className="button" onClick={openCheckIn}>Confirmar comparecimento</button>}</div>
    </>}
    {!loading && reservation && mode === "check-in" && <form className="table-reservation-checkin" onSubmit={confirmCheckIn}>
      <p>Selecione uma ou mais mesas usadas por <strong>{reservation.customerName}</strong>.</p>
      <div className="table-reservation-table-picker">
        {tables.map((table) => <label key={table.id} className={selectedIds.includes(table.id) ? "is-selected" : ""}><input type="checkbox" checked={selectedIds.includes(table.id)} onChange={() => toggleTable(table.id)} /><span><strong>{table.name}</strong><small>{table.capacity ? `Até ${table.capacity} pessoas` : "Capacidade não informada"}</small></span><Check size={17} aria-hidden="true" /></label>)}
        {!tables.length && <div className="table-reservation-empty table-reservation-empty--compact"><Utensils size={22} /><strong>Nenhuma mesa ativa</strong><p>Peça a um administrador para cadastrar mesas nesta unidade.</p></div>}
      </div>
      <div className="table-reservation-form__actions"><button type="button" className="button button--ghost" onClick={() => { setMode("detail"); setError(""); }}>Voltar</button><button className="button" disabled={saving || !selectedIds.length}>{saving ? "Confirmando..." : "Confirmar comparecimento"}</button></div>
    </form>}
  </AccessibleDialog>;
}

export default function TableReservations() {
  const [capabilities, setCapabilities] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState(localDateValue());
  const [result, setResult] = useState({ items: [], summary: EMPTY_SUMMARY });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.get("/table-reservations/capabilities"), api.get("/table-reservations/units")])
      .then(([capabilityResponse, unitsResponse]) => {
        if (!active) return;
        setCapabilities(capabilityResponse.data); setUnits(unitsResponse.data);
        const preferred = capabilityResponse.data.productionStoreId || unitsResponse.data[0]?.id || "";
        setUnitId(String(preferred));
      })
      .catch((error) => { if (active) setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível abrir a Central de Reservas." }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadReservations = useCallback(async () => {
    if (!unitId || !date) { setResult({ items: [], summary: EMPTY_SUMMARY }); return; }
    setLoading(true);
    try { setResult((await api.get("/table-reservations", { params: { unitId, date } })).data); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar as reservas." }); }
    finally { setLoading(false); }
  }, [unitId, date]);

  useEffect(() => { loadReservations(); }, [loadReservations]);
  const selectedUnit = useMemo(() => units.find((unit) => String(unit.id) === String(unitId)), [units, unitId]);

  const created = async () => { setShowNew(false); setNotice({ variant: "success", text: "Reserva criada e confirmada com sucesso." }); await loadReservations(); };
  const checkedIn = async () => { setNotice({ variant: "success", text: "Comparecimento confirmado e mesas registradas." }); await loadReservations(); };

  return <section className="table-reservations-page">
    <header className="table-reservations-header">
      <div><h1>Central de Reservas</h1><p>Acompanhe os clientes esperados e registre o atendimento na chegada.</p></div>
      {capabilities?.canCreate && <button type="button" className="button table-reservations-new" disabled={!units.length} onClick={() => setShowNew(true)}><Plus size={17} />Nova reserva</button>}
    </header>

    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}

    <section className="table-reservation-filters" aria-label="Filtros de reservas">
      <label><MapPin size={16} aria-hidden="true" /><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!units.length || Boolean(capabilities?.productionStoreId)}>{!units.length && <option value="">Nenhuma unidade habilitada</option>}{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label><CalendarDays size={16} aria-hidden="true" /><span>Data</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="table-reservation-filters__context"><Clock3 size={16} /><span>{selectedUnit ? `${selectedUnit.name} em ${formatDate(date)}` : "Selecione uma unidade"}</span></div>
    </section>

    <SummaryStrip summary={result.summary || EMPTY_SUMMARY} />

    <section className="table-reservation-list" aria-busy={loading}>
      <div className="table-reservation-list__heading"><div><h2>Reservas do dia</h2><p>{loading ? "Atualizando..." : `${result.items.length} registro${result.items.length === 1 ? "" : "s"}`}</p></div><span>Ordenadas por horário</span></div>
      {loading && <div className="table-reservation-loading"><span /><span /><span /></div>}
      {!loading && result.items.length > 0 && <div className="table-reservation-table-wrap"><table className="table-reservation-table"><thead><tr><th>Horário</th><th>Cliente</th><th>E-mail</th><th>Pessoas</th><th>Status</th><th>Mesas</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id} tabIndex="0" role="button" aria-label={`Abrir reserva de ${item.customerName} às ${item.reservationTime}`} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}><td data-label="Horário"><strong>{item.reservationTime}</strong><span className="table-reservation-row-action">Abrir detalhes <ChevronRight size={15} /></span></td><td data-label="Cliente"><strong>{item.customerName}</strong></td><td data-label="E-mail">{item.customerEmail}</td><td data-label="Pessoas"><span className="table-reservation-people"><Users size={15} />{item.peopleCount}</span></td><td data-label="Status"><span className={`table-reservation-status table-reservation-status--${item.status.toLowerCase()}`}>{statusLabels[item.status] || item.status}</span></td><td data-label="Mesas">{tableNames(item.tables)}</td></tr>)}</tbody></table></div>}
      {!loading && !units.length && <div className="table-reservation-empty"><MapPin size={28} /><strong>Nenhuma unidade habilitada</strong><p>Um administrador precisa selecionar as lojas que trabalham com reservas em Configurações → Reservas.</p></div>}
      {!loading && units.length > 0 && !result.items.length && <div className="table-reservation-empty"><CalendarDays size={28} /><strong>Nenhuma reserva para este dia</strong><p>{capabilities?.canCreate ? "Use “Nova reserva” para cadastrar o primeiro cliente." : "Altere a data para consultar outros atendimentos."}</p>{capabilities?.canCreate && <button type="button" className="button button--ghost" onClick={() => setShowNew(true)}>Criar reserva</button>}</div>}
    </section>

    {showNew && <NewReservationDialog units={units} initialUnitId={unitId} initialDate={date} onClose={() => setShowNew(false)} onCreated={created} />}
    {selectedId && capabilities && <ReservationDetailDialog reservationId={selectedId} capabilities={capabilities} onClose={() => setSelectedId(null)} onChanged={checkedIn} />}
  </section>;
}
