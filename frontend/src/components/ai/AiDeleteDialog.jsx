import { useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";

function AiDeleteDialog({ conversation, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!conversation) return undefined;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [conversation, onCancel]);

  if (!conversation) return null;

  return (
    <div className="ai-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="ai-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-delete-title" aria-describedby="ai-delete-description" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="ai-icon-button ai-dialog__close" onClick={onCancel} aria-label="Fechar" title="Fechar"><X size={18} /></button>
        <span className="ai-dialog__icon" aria-hidden="true"><Trash2 size={20} /></span>
        <h2 id="ai-delete-title">Excluir conversa?</h2>
        <p id="ai-delete-description">“{conversation.title}” será removida apenas desta demonstração local.</p>
        <div className="ai-dialog__actions">
          <button ref={cancelButtonRef} type="button" className="ai-dialog__cancel" onClick={onCancel}>Cancelar</button>
          <button type="button" className="ai-dialog__confirm" onClick={onConfirm}>Excluir conversa</button>
        </div>
      </section>
    </div>
  );
}

export default AiDeleteDialog;
