import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Video, X } from "lucide-react";
import { parseArticleVideoUrl } from "../utils/articleVideo";

function ArticleVideoModal({ initialValue, onClose, onSave, onRemove }) {
  const [url, setUrl] = useState(initialValue?.url || "");
  const [caption, setCaption] = useState(initialValue?.caption || "");
  const parsed = useMemo(() => parseArticleVideoUrl(url), [url]);
  const hasUrl = Boolean(url.trim());

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const submit = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!parsed) return;
    onSave({ ...parsed, caption: caption.trim() });
  };

  return createPortal(
    <div className="modal-backdrop article-video-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-card article-video-modal" role="dialog" aria-modal="true" aria-labelledby="article-video-title">
        <div className="modal-card__header">
          <div>
            <h3 id="article-video-title"><Video size={19} /> {initialValue ? "Editar vídeo" : "Inserir vídeo"}</h3>
            <p>Cole um link do YouTube ou do Google Drive.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="article-video-modal__form">
          <label>
            <span>Link do vídeo</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              autoFocus
              required
            />
          </label>

          {hasUrl && !parsed && <p className="article-video-modal__error">Use um link válido do YouTube ou de um arquivo do Google Drive.</p>}

          {parsed && (
            <>
              <div className="article-video-modal__provider">{parsed.label} identificado</div>
              {parsed.provider === "drive" && (
                <p className="article-video-modal__warning">
                  Confirme no Google Drive que todas as pessoas que lerão o artigo possuem acesso ao arquivo.
                </p>
              )}
              <div className="article-video-frame article-video-modal__preview">
                <iframe
                  src={parsed.embedUrl}
                  title={`Prévia do vídeo no ${parsed.label}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </>
          )}

          <label>
            <span>Legenda <small>(opcional)</small></span>
            <input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={200} placeholder="Explique brevemente o conteúdo do vídeo" />
            <small>{caption.length}/200</small>
          </label>

          <div className="form-actions article-video-modal__actions">
            {onRemove && <button type="button" className="button button--danger article-video-modal__remove" onClick={onRemove}>Remover vídeo</button>}
            <button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="button" disabled={!parsed}>{initialValue ? "Salvar vídeo" : "Inserir vídeo"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default ArticleVideoModal;
