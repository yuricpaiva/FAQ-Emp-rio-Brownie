import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BookOpen, CheckCheck, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days === 1 ? "" : "s"}`;
  return new Date(value).toLocaleDateString("pt-BR");
}

function NotificationBell() {
  const navigate = useNavigate();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panelStyle, setPanelStyle] = useState({});

  const positionPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = Math.min(390, window.innerWidth - 16);
    const left = window.innerWidth <= 720
      ? window.innerWidth - panelWidth - 8
      : Math.min(Math.max(8, rect.left), window.innerWidth - panelWidth - 8);
    setPanelStyle({ top: `${rect.bottom + 8}px`, left: `${left}px`, width: `${panelWidth}px` });
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get("/notifications", { params: { limit: 12 } });
      setItems(response.data.items || []);
      setUnreadCount(response.data.unreadCount || 0);
      setError("");
    } catch {
      if (!quiet) setError("Não foi possível carregar as notificações.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 30000);
    const refresh = () => load({ quiet: true });
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    positionPanel();
    load({ quiet: true });
    const closeOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    window.addEventListener("resize", positionPanel);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      window.removeEventListener("resize", positionPanel);
    };
  }, [open, load, positionPanel]);

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setUnreadCount(0);
      setItems((current) => current.map((item) => ({ ...item, read: true, readAt: new Date().toISOString() })));
    } catch {
      setError("Não foi possível marcar as notificações como lidas.");
    }
  };

  const openNotification = async (notification) => {
    if (!notification.read) {
      try {
        await api.patch(`/notifications/${notification.id}/read`);
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
        setUnreadCount((current) => Math.max(0, current - 1));
      } catch {
        // A navegação continua disponível mesmo se a confirmação de leitura falhar.
      }
    }
    setOpen(false);
    navigate(notification.link);
  };

  return (
    <div className="notification-center">
      <button
        ref={triggerRef}
        type="button"
        className={`notification-bell ${open ? "notification-bell--open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={unreadCount ? `${unreadCount} notificações não lidas` : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && createPortal(
        <section ref={panelRef} className="notification-panel" style={panelStyle} role="dialog" aria-modal="false" aria-label="Notificações">
          <header className="notification-panel__header">
            <div>
              <h2>Notificações</h2>
              <span>{unreadCount ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : "Tudo em dia"}</span>
            </div>
            <div className="notification-panel__header-actions">
              {unreadCount > 0 && <button type="button" onClick={markAllRead}><CheckCheck size={15} /> Marcar todas como lidas</button>}
              <button type="button" className="notification-panel__close" onClick={() => setOpen(false)} aria-label="Fechar notificações"><X size={17} /></button>
            </div>
          </header>

          <div className="notification-panel__list">
            {loading && <p className="notification-panel__state">Carregando notificações...</p>}
            {!loading && error && <p className="notification-panel__state notification-panel__state--error">{error}</p>}
            {!loading && !error && !items.length && (
              <div className="notification-panel__empty"><Bell size={22} /><strong>Nenhuma notificação</strong><span>Novos artigos aparecerão aqui.</span></div>
            )}
            {!loading && items.map((notification) => (
              <button
                type="button"
                key={notification.id}
                className={`notification-item ${notification.read ? "" : "notification-item--unread"}`}
                onClick={() => openNotification(notification)}
              >
                <span className="notification-item__icon"><BookOpen size={17} /></span>
                <span className="notification-item__content">
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <small>Base de conhecimento · {relativeTime(notification.createdAt)}</small>
                </span>
                {!notification.read && <span className="notification-item__dot" aria-label="Não lida" />}
              </button>
            ))}
          </div>
        </section>,
        document.body
      )}
    </div>
  );
}

export default NotificationBell;
