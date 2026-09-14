import { useEffect, useState } from "react";
import { Check, MoreHorizontal, PanelLeftOpen, Pencil, Trash2, X } from "lucide-react";

function AiConversationHeader({ conversation, historyOpen, onOpenHistory, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => { setRenaming(false); }, [conversation?.id]);

  const startRename = (event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    setTitle(conversation.title);
    setRenaming(true);
  };

  const saveRename = () => {
    if (title.trim()) onRename(title.trim());
    setRenaming(false);
  };

  return (
    <header className="ai-conversation-header">
      {!historyOpen && <button type="button" className="ai-icon-button" onClick={onOpenHistory} aria-label="Abrir histórico" title="Abrir histórico"><PanelLeftOpen size={18} /></button>}
      {renaming ? (
        <div className="ai-conversation-header__rename">
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveRename(); if (event.key === "Escape") setRenaming(false); }} aria-label="Novo título da conversa" />
          <button type="button" onClick={saveRename} aria-label="Salvar título" title="Salvar"><Check size={16} /></button>
          <button type="button" onClick={() => setRenaming(false)} aria-label="Cancelar alteração" title="Cancelar"><X size={16} /></button>
        </div>
      ) : <strong title={conversation?.title}>{conversation?.title || "Assistente IA"}</strong>}
      {conversation && !renaming && (
        <details className="ai-options-menu">
          <summary aria-label="Opções da conversa" title="Opções da conversa"><MoreHorizontal size={19} /></summary>
          <div role="menu">
            <button type="button" role="menuitem" onClick={startRename}><Pencil size={15} />Renomear conversa</button>
            <button type="button" role="menuitem" className="ai-options-menu__danger" onClick={onDelete}><Trash2 size={15} />Excluir conversa</button>
          </div>
        </details>
      )}
    </header>
  );
}

export default AiConversationHeader;
