import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import SystemNotification, { useSystemNotification } from "../SystemNotification";
import { formatInterval } from "./reservationDates";

function ReservationList({ items, onCancel, cancelling }) {
  if (!items.length) return <div className="reservation-empty">Nenhuma reserva nesta seção.</div>;
  return <div className="reservation-card-list">{items.map((item) => (
    <article key={item.id} className="reservation-card">
      <div><span className="reservation-card__type">{item.resource.type.name}</span><h3>{item.resource.name}</h3><p>{formatInterval(item)}</p><small>{item.purpose || "Sem finalidade informada"}</small></div>
      <div className="reservation-card__status"><span className={`reservation-status reservation-status--${item.status.toLowerCase()}`}>{item.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}</span>{item.status === "CONFIRMED" && new Date(item.startAt) > new Date() && <button type="button" className="button button--danger" disabled={cancelling === item.id} onClick={() => onCancel(item)}>{cancelling === item.id ? "Cancelando..." : "Cancelar"}</button>}</div>
    </article>
  ))}</div>;
}

export default function MyReservations({ refreshToken, onChanged }) {
  const { confirm } = useSystemNotification();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const [message, setMessage] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get("/reservations/mine")).data); }
    catch (error) { setMessage({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar suas reservas." }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshToken]);
  const upcoming = useMemo(() => items.filter((item) => item.status === "CONFIRMED" && new Date(item.startAt) > new Date()).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)), [items]);
  const history = useMemo(() => items.filter((item) => !upcoming.includes(item)), [items, upcoming]);
  const cancel = async (item) => {
    if (!await confirm(`Cancelar a reserva de ${item.resource.name}?`, { confirmLabel: "Cancelar reserva" })) return;
    setCancelling(item.id);
    try { await api.patch(`/reservations/${item.id}/cancel`, {}); setMessage({ variant: "success", text: "Reserva cancelada. O horário voltou a ficar disponível." }); await load(); onChanged?.(); }
    catch (error) { setMessage({ variant: "error", text: error.response?.data?.error || "Não foi possível cancelar a reserva." }); }
    finally { setCancelling(null); }
  };
  return <section className="reservation-section"><div><h2>Minhas reservas</h2><p className="section-copy">Acompanhe compromissos futuros e o histórico.</p></div>{message && <SystemNotification variant={message.variant}>{message.text}</SystemNotification>}{loading ? <div className="reservation-empty">Carregando reservas...</div> : <><h3 className="reservation-subtitle">Próximas</h3><ReservationList items={upcoming} onCancel={cancel} cancelling={cancelling} /><h3 className="reservation-subtitle">Histórico</h3><ReservationList items={history} onCancel={cancel} cancelling={cancelling} /></>}</section>;
}
