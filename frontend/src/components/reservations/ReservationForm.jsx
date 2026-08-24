import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import SystemNotification from "../SystemNotification";
import { addDays, fortalezaDate, localInstant } from "./reservationDates";
import ResourceFeatures from "./ResourceFeatures";

export default function ReservationForm({ onCreated, embedded = false }) {
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(() => addDays(fortalezaDate(), 1));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [endDate, setEndDate] = useState(() => addDays(fortalezaDate(), 1));
  const [resources, setResources] = useState([]);
  const [resourceId, setResourceId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const selectedType = useMemo(() => types.find((type) => String(type.id) === String(typeId)), [typeId, types]);
  const isPeriod = selectedType?.reservationMode === "PERIOD";

  useEffect(() => {
    api.get("/reservations/resource-types")
      .then((response) => setTypes(response.data))
      .catch((error) => setMessage({ variant: "error", text: error.response?.data?.error || "Não foi possível listar os tipos." }));
  }, []);

  useEffect(() => { setResources([]); setResourceId(""); }, [typeId, date, endDate, startTime, endTime]);

  const intervalPayload = () => isPeriod
    ? { startDate: date, endDate }
    : { startAt: localInstant(date, startTime), endAt: localInstant(date, endTime) };

  const consult = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ typeId, ...intervalPayload() });
      const response = await api.get(`/reservations/availability?${params}`);
      setResources(response.data.resources);
      const firstAvailable = response.data.resources.find((resource) => resource.available);
      setResourceId(firstAvailable ? String(firstAvailable.id) : "");
    } catch (error) {
      setMessage({ variant: "error", text: error.response?.data?.error || "Não foi possível consultar a disponibilidade." });
    } finally { setLoading(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.post("/reservations", { resourceId: Number(resourceId), purpose, ...intervalPayload() });
      setPurpose("");
      setResources([]);
      setResourceId("");
      setMessage({ variant: "success", text: "Reserva confirmada com sucesso." });
      onCreated?.();
    } catch (error) {
      const fallback = "Não foi possível concluir a reserva. Escolha outro horário ou recurso.";
      setMessage({ variant: "error", text: error.response?.data?.error || fallback });
      if (error.response?.status === 409) consult();
    } finally { setSaving(false); }
  };

  const Container = embedded ? "div" : "section";
  return (
    <Container className={embedded ? "reservation-new-modal__body" : "reservation-section"}>
      {!embedded && <div><h2>Nova reserva</h2><p className="section-copy">Escolha o período para ver primeiro os recursos disponíveis.</p></div>}
      {message && <SystemNotification variant={message.variant}>{message.text}</SystemNotification>}
      <form className="reservation-form" onSubmit={submit}>
        <label><span>Tipo de recurso</span><select required value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="">Selecione</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
        <label><span>{isPeriod ? "Data inicial" : "Data"}</span><input type="date" min={fortalezaDate()} required value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {isPeriod ? (
          <label><span>Data final</span><input type="date" min={date} required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        ) : <><label><span>Início</span><input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label><span>Fim</span><input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></>}
        <div className="reservation-form__consult"><button type="button" className="button button--ghost" disabled={!typeId || loading} onClick={consult}>{loading ? "Consultando..." : "Consultar disponibilidade"}</button></div>
        {!!resources.length && <div className="reservation-options">
          {resources.map((resource) => <label key={resource.id} className={`reservation-option ${resource.available ? "" : "reservation-option--unavailable"}`}>
            <input type="radio" name="resource" value={resource.id} checked={String(resourceId) === String(resource.id)} disabled={!resource.available} onChange={(event) => setResourceId(event.target.value)} />
            <span className="reservation-option__content"><strong>{resource.available ? "✓" : "×"} {resource.name}</strong><small>{resource.location || resource.unavailableReason || "Disponível"}</small><ResourceFeatures resource={resource} /></span>
          </label>)}
        </div>}
        {resources.length > 0 && !resources.some((resource) => resource.available) && <div className="reservation-empty">Nenhum recurso disponível nesse período.</div>}
        {!!resourceId && <label className="reservation-form__purpose"><span>Finalidade</span><textarea required maxLength="500" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Ex.: reunião de alinhamento" /></label>}
        {!!resourceId && <div className="reservation-form__actions"><button type="submit" className="button" disabled={saving || !purpose.trim()}>{saving ? "Confirmando..." : "Confirmar reserva"}</button></div>}
      </form>
    </Container>
  );
}
