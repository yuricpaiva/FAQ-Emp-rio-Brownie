import { useEffect, useRef, useState } from "react";
import { ArrowUp, FilePlus2, ImagePlus, Paperclip, Plus, X } from "lucide-react";
import AiAttachmentPreview from "./AiAttachmentPreview";

const DOCUMENT_TYPES = ".pdf,.xls,.xlsx,.csv,.docx,.txt";
const IMAGE_TYPES = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

function createAttachment(file) {
  return {
    id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    type: file.type,
    size: file.size,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    file
  };
}

function AiComposer({ value, onChange, onSend, isProcessing, disabled = false, resetKey, capabilities }) {
  const [attachments, setAttachments] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef(null);
  const attachmentsRef = useRef(attachments);
  const menuRef = useRef(null);
  const documentInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
  };

  useEffect(resizeTextarea, [value]);
  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    setAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      return [];
    });
    setMenuOpen(false);
  }, [resetKey]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const addFiles = (files) => {
    const next = Array.from(files || []).map(createAttachment);
    setAttachments((current) => [...current, ...next]);
    setMenuOpen(false);
  };

  const removeAttachment = (id) => {
    setAttachments((current) => current.filter((attachment) => {
      if (attachment.id === id && attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return attachment.id !== id;
    }));
  };

  const submit = () => {
    if (isProcessing || disabled || (!value.trim() && attachments.length === 0)) return;
    onSend({ content: value.trim(), attachments });
    attachmentsRef.current = [];
    onChange("");
    setAttachments([]);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="ai-composer-wrap">
      <div className={`ai-composer ${isProcessing ? "ai-composer--processing" : ""}`}>
        {attachments.length > 0 && (
          <div className="ai-composer__attachments">
            {attachments.map((attachment) => <AiAttachmentPreview key={attachment.id} attachment={attachment} onRemove={removeAttachment} />)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte alguma coisa..."
          rows="1"
          disabled={isProcessing || disabled}
          aria-label="Mensagem para o Browninho"
        />
        <div className="ai-composer__toolbar">
          <div className="ai-composer__attachment-menu" ref={menuRef}>
            <button type="button" className="ai-icon-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu" aria-label="Adicionar anexo" title="Adicionar anexo" disabled={isProcessing || disabled || capabilities?.documents === false}>
              {menuOpen ? <X size={18} /> : <Plus size={19} />}
            </button>
            {menuOpen && (
              <div className="ai-composer__menu" role="menu">
                <button type="button" role="menuitem" onClick={() => documentInputRef.current?.click()}><FilePlus2 size={17} /><span><strong>Adicionar arquivo</strong><small>PDF, planilha, documento ou texto</small></span></button>
                <button type="button" role="menuitem" onClick={() => imageInputRef.current?.click()}><ImagePlus size={17} /><span><strong>Adicionar imagem</strong><small>PNG, JPG ou WEBP</small></span></button>
              </div>
            )}
            <input ref={documentInputRef} className="ai-visually-hidden" type="file" accept={DOCUMENT_TYPES} multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            <input ref={imageInputRef} className="ai-visually-hidden" type="file" accept={IMAGE_TYPES} multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          </div>
          <span className="ai-composer__hint"><Paperclip size={13} /> Até 6 arquivos, 10 MB cada</span>
          <button type="button" className="ai-composer__send" onClick={submit} disabled={isProcessing || disabled || (!value.trim() && attachments.length === 0)} aria-label="Enviar mensagem" title="Enviar mensagem">
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
      <small className="ai-composer-wrap__note">O Browninho pode cometer erros. Confira informações importantes.</small>
    </div>
  );
}

export default AiComposer;
