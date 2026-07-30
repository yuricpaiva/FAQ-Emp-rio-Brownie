import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const defaultTitles = {
  brand: "FAQ EB",
  error: "Não foi possível concluir",
  info: "Informação",
  success: "Operação concluída",
  warning: "Atenção",
};

const SystemNotificationContext = createContext(null);

function getNotificationRegion() {
  let region = document.getElementById("system-notification-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "system-notification-region";
    region.className = "system-notification-region";
    region.setAttribute("aria-label", "Notificações do sistema");
    document.body.appendChild(region);
  }
  return region;
}

function SystemNotification({
  actions,
  children,
  className = "",
  id,
  onAnimationEnd,
  role,
  title,
  variant = "info",
}) {
  const [region, setRegion] = useState(null);

  useEffect(() => {
    setRegion(getNotificationRegion());
  }, []);

  if (!region) return null;

  const notificationRole = role || (variant === "error" ? "alert" : "status");

  return createPortal(
    <aside
      id={id}
      className={`system-notification system-notification--${variant} ${className}`.trim()}
      role={notificationRole}
      aria-live={variant === "error" ? "assertive" : "polite"}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="system-notification__copy">
        <strong>{title || defaultTitles[variant] || defaultTitles.info}</strong>
        <div className="system-notification__message">{children}</div>
      </div>
      {actions && <div className="system-notification__actions">{actions}</div>}
    </aside>,
    region
  );
}

export function SystemNotificationProvider({ children }) {
  const [confirmation, setConfirmation] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    if (resolveRef.current) resolveRef.current(false);

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmation({
        cancelLabel: options.cancelLabel || "Cancelar",
        confirmLabel: options.confirmLabel || "Confirmar",
        message,
        title: options.title || "Confirme esta ação",
      });
    });
  }, []);

  const answerConfirmation = useCallback((answer) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setConfirmation(null);
  }, []);

  useEffect(
    () => () => {
      resolveRef.current?.(false);
    },
    []
  );

  return (
    <SystemNotificationContext.Provider value={{ confirm }}>
      {children}
      {confirmation && (
        <SystemNotification
          variant="warning"
          title={confirmation.title}
          role="alertdialog"
          actions={
            <>
              <button
                type="button"
                className="system-notification__secondary"
                onClick={() => answerConfirmation(false)}
              >
                {confirmation.cancelLabel}
              </button>
              <button type="button" autoFocus onClick={() => answerConfirmation(true)}>
                {confirmation.confirmLabel}
              </button>
            </>
          }
        >
          {confirmation.message}
        </SystemNotification>
      )}
    </SystemNotificationContext.Provider>
  );
}

export function useSystemNotification() {
  const context = useContext(SystemNotificationContext);
  if (!context) {
    throw new Error("useSystemNotification deve ser usado dentro de SystemNotificationProvider.");
  }
  return context;
}

export default SystemNotification;
