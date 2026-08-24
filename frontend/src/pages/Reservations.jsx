import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import SystemNotification from "../components/SystemNotification";
import ReservationAdmin from "../components/reservations/ReservationAdmin";
import ReservationCalendar from "../components/reservations/ReservationCalendar";
import ReservationForm from "../components/reservations/ReservationForm";
import MyReservations from "../components/reservations/MyReservations";

export default function Reservations() {
  const { user } = useAuth();
  const [tab, setTab] = useState("calendar");
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  const tabs = [
    ["calendar", "Calendário"],
    ["mine", "Minhas reservas"],
    ...(user?.role === "admin" ? [["admin", "Administração"]] : []),
  ];

  useEffect(() => {
    if (!showNewReservation) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setShowNewReservation(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showNewReservation]);

  const reservationCreated = () => {
    setShowNewReservation(false);
    setNotice("Reserva confirmada com sucesso.");
    refresh();
  };

  return <section className="reservations-page">
    <header className="reservation-page-header"><div><span className="reservation-eyebrow">Recursos compartilhados</span><h1>Reservas</h1><p>Consulte a disponibilidade e organize salas, equipamentos e outros recursos.</p></div></header>
    <nav className="reservation-tabs" aria-label="Áreas de reservas">{tabs.map(([value, label]) => <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {notice && <SystemNotification variant="success" onDismiss={() => setNotice("")}>{notice}</SystemNotification>}
    {tab === "calendar" && <ReservationCalendar refreshToken={refreshToken} onNewReservation={() => setShowNewReservation(true)} />}
    {tab === "mine" && <MyReservations refreshToken={refreshToken} onChanged={refresh} />}
    {tab === "admin" && user?.role === "admin" && <ReservationAdmin refreshToken={refreshToken} onChanged={refresh} />}

    {showNewReservation && <div className="modal-backdrop" onClick={() => setShowNewReservation(false)}>
      <div className="modal-card reservation-new-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-new-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div><span className="reservation-eyebrow">Recursos compartilhados</span><h3 id="reservation-new-modal-title">Nova reserva</h3><p className="section-copy">Escolha o período para ver os recursos disponíveis.</p></div>
          <button type="button" aria-label="Fechar nova reserva" onClick={() => setShowNewReservation(false)}>×</button>
        </div>
        <ReservationForm embedded onCreated={reservationCreated} />
      </div>
    </div>}
  </section>;
}
