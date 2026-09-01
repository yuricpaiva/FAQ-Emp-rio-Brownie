import { useEffect, useId } from "react";
import { X } from "lucide-react";

function Modal({ actions, children, className = "", description, onClose, open, title, width = "medium" }) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className={`modal-card ui-modal ui-modal--${width} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="ui-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="ui-icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="ui-modal__body">{children}</div>
        {actions && <footer className="ui-modal__actions">{actions}</footer>}
      </section>
    </div>
  );
}

export default Modal;
