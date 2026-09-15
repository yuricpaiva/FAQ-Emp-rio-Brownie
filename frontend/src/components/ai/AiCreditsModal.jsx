import { useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

function AiCreditsModal({ open, onClose, onGoHome }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  return <div className="ai-dialog-backdrop ai-credits-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ai-credits-modal" role="alertdialog" aria-modal="true" aria-labelledby="ai-credits-title" aria-describedby="ai-credits-description" onMouseDown={(event) => event.stopPropagation()}>
      <button ref={closeButtonRef} type="button" className="ai-icon-button ai-credits-modal__close" onClick={onClose} aria-label="Fechar aviso" title="Fechar"><X size={18} /></button>
      <div className="ai-credits-modal__visual" aria-hidden="true">
        <span className="ai-credits-modal__halo" />
        <span className="ai-credits-modal__spark ai-credits-modal__spark--one" />
        <span className="ai-credits-modal__spark ai-credits-modal__spark--two" />
        <img src="/browninho-creditos-esgotados.png" alt="" />
      </div>
      <div className="ai-credits-modal__content">
        <span className="ai-credits-modal__eyebrow">Hora da recarga</span>
        <h2 id="ai-credits-title">Ops... acabaram os créditos!</h2>
        <p id="ai-credits-description">O Browninho precisa recarregar para continuar.</p>
        <p className="ai-credits-modal__help">Fale com o setor de <strong>Tecnologia</strong>.</p>
        <div className="ai-credits-modal__actions">
          <button type="button" className="ai-credits-modal__secondary" onClick={onGoHome}><ArrowLeft size={16} />Voltar ao início</button>
          <button type="button" className="ai-credits-modal__primary" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </section>
  </div>;
}

export default AiCreditsModal;
