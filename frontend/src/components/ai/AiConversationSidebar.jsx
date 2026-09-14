import { useMemo, useRef, useState } from "react";
import { MoreHorizontal, PanelLeftClose, Pencil, Plus, Trash2, X } from "lucide-react";

const GROUP_ORDER = ["Hoje", "Ontem", "Últimos 7 dias", "Mais antigas"];

function getGroupLabel(dateValue) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today - date) / 86400000));
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days <= 7) return "Últimos 7 dias";
  return "Mais antigas";
}

function AiConversationSidebar({ conversations, activeId, open, onClose, onNew, onSelect, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const cancelRenameRef = useRef(false);

  const groups = useMemo(() => {
    const grouped = Object.fromEntries(GROUP_ORDER.map((label) => [label, []]));
    [...conversations]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((conversation) => grouped[getGroupLabel(conversation.updatedAt)].push(conversation));
    return GROUP_ORDER.map((label) => ({ label, conversations: grouped[label] })).filter((group) => group.conversations.length);
  }, [conversations]);

  const startRename = (conversation, details) => {
    details?.removeAttribute("open");
    cancelRenameRef.current = false;
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const saveRename = (conversationId) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    const title = editingTitle.trim();
    if (title) onRename(conversationId, title);
    setEditingId(null);
  };

  return (
    <aside className={`ai-history ${open ? "ai-history--open" : ""}`} aria-label="Histórico do Browninho" aria-hidden={!open}>
      <div className="ai-history__header">
        <span><strong>Conversas</strong><small>Histórico local</small></span>
        <button type="button" className="ai-icon-button ai-history__desktop-close" onClick={onClose} aria-label="Recolher histórico" title="Recolher histórico"><PanelLeftClose size={18} /></button>
        <button type="button" className="ai-icon-button ai-history__mobile-close" onClick={onClose} aria-label="Fechar histórico" title="Fechar histórico"><X size={18} /></button>
      </div>
      <button type="button" className="ai-history__new" onClick={onNew}><Plus size={17} />Nova conversa</button>
      <div className="ai-history__list">
        {groups.length === 0 ? (
          <p className="ai-history__empty">Nenhuma conversa ainda.</p>
        ) : groups.map((group) => (
          <section key={group.label} className="ai-history__group" aria-labelledby={`ai-group-${group.label.replace(/\s/g, "-")}`}>
            <h2 id={`ai-group-${group.label.replace(/\s/g, "-")}`}>{group.label}</h2>
            {group.conversations.map((conversation) => (
              <div key={conversation.id} className={`ai-history__item ${activeId === conversation.id ? "is-active" : ""}`}>
                {editingId === conversation.id ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={() => saveRename(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); saveRename(conversation.id); }
                      if (event.key === "Escape") { event.preventDefault(); cancelRenameRef.current = true; setEditingId(null); }
                    }}
                    aria-label="Novo título da conversa"
                  />
                ) : (
                  <button type="button" className="ai-history__select" onClick={() => onSelect(conversation.id)} title={conversation.title}>{conversation.title}</button>
                )}
                {editingId !== conversation.id && (
                  <details className="ai-options-menu ai-options-menu--history">
                    <summary aria-label={`Opções de ${conversation.title}`} title="Opções"><MoreHorizontal size={17} /></summary>
                    <div role="menu">
                      <button type="button" role="menuitem" onClick={(event) => startRename(conversation, event.currentTarget.closest("details"))}><Pencil size={14} />Renomear</button>
                      <button type="button" role="menuitem" className="ai-options-menu__danger" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(conversation.id); }}><Trash2 size={14} />Excluir</button>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

export default AiConversationSidebar;
