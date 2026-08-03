import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const defaultTitles = {
  brand: "FAQ EB",
  error: "Não foi possível concluir",
  info: "Informação",
  success: "Operação concluída",
  warning: "Atenção",
};

const SystemNotificationContext = createContext(null);

const defaultDismissTimes = {
  brand: 10000,
  error: 12000,
  info: 10000,
  success: 7000,
  warning: 12000,
};

function getNotificationText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNotificationText).join("|");
  return getNotificationText(node.props?.children);
}

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
  autoDismissMs,
  children,
  className = "",
  id,
  onDismiss,
  onAnimationEnd,
  role,
  title,
  variant = "info",
}) {
  const [region, setRegion] = useState(null);
  const [dismissState, setDismissState] = useState("visible");
  const notificationIdentity = useMemo(
    () => `${variant}|${title || ""}|${getNotificationText(children)}`,
    [children, title, variant]
  );
  const dismissTime = autoDismissMs ?? (actions ? 0 : defaultDismissTimes[variant] || 10000);

  useEffect(() => {
    setRegion(getNotificationRegion());
  }, []);

  useEffect(() => {
    setDismissState("visible");
    if (!dismissTime) return undefined;

    const timer = window.setTimeout(() => setDismissState("leaving"), dismissTime);
    return () => window.clearTimeout(timer);
  }, [dismissTime, notificationIdentity]);

  const dismiss = useCallback(() => {
    if (dismissState !== "visible") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDismissState("dismissed");
      onDismiss?.();
      return;
    }
    setDismissState("leaving");
  }, [dismissState, onDismiss]);

  const handleAnimationEnd = (event) => {
    if (dismissState === "leaving") {
      setDismissState("dismissed");
      onDismiss?.();
    }
    onAnimationEnd?.(event);
  };

  if (!region || dismissState === "dismissed") return null;

  const notificationRole = role || (variant === "error" ? "alert" : "status");

  return createPortal(
    <aside
      id={id}
      className={`system-notification system-notification--${variant} ${
        dismissState === "leaving" ? "system-notification--leaving" : ""
      } ${className}`.trim()}
      role={notificationRole}
      aria-live={variant === "error" ? "assertive" : "polite"}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="system-notification__copy">
        <strong>{title || defaultTitles[variant] || defaultTitles.info}</strong>
        <div className="system-notification__message">{children}</div>
      </div>
      {actions && <div className="system-notification__actions">{actions}</div>}
      <button
        type="button"
        className="system-notification__close"
        aria-label="Fechar notificação"
        title="Fechar"
        onClick={dismiss}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
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
          onDismiss={() => answerConfirmation(false)}
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
