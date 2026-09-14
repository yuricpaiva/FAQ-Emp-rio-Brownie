import { useEffect, useMemo, useRef, useState } from "react";
import AiComposer from "../components/ai/AiComposer";
import AiConversationHeader from "../components/ai/AiConversationHeader";
import AiConversationSidebar from "../components/ai/AiConversationSidebar";
import AiDeleteDialog from "../components/ai/AiDeleteDialog";
import AiEmptyState from "../components/ai/AiEmptyState";
import AiMessageList from "../components/ai/AiMessageList";
import { AI_SUGGESTIONS, createMockConversations, SIMULATED_ASSISTANT_RESPONSE } from "../components/ai/aiAssistantMocks";
import "../styles/ai-assistant.css";

const MOBILE_QUERY = "(max-width: 720px)";

function createId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function revokeConversationPreviews(conversation) {
  conversation?.messages?.forEach((message) => message.attachments?.forEach((attachment) => {
    if (attachment.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(attachment.previewUrl);
  }));
}

function AiAssistant() {
  const [conversations, setConversations] = useState(createMockConversations);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [historyOpen, setHistoryOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);
  const [respondingConversationId, setRespondingConversationId] = useState(null);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const responseTimerRef = useRef(null);
  const conversationsRef = useRef(conversations);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => {
      setIsMobile(event.matches);
      setHistoryOpen(!event.matches);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => () => {
    if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
    conversationsRef.current.forEach(revokeConversationPreviews);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [activeId, conversations]
  );

  const startNewConversation = () => {
    setActiveId(null);
    setDraft("");
    setComposerResetKey((value) => value + 1);
    if (isMobile) setHistoryOpen(false);
  };

  const selectConversation = (id) => {
    setActiveId(id);
    setDraft("");
    setComposerResetKey((value) => value + 1);
    if (isMobile) setHistoryOpen(false);
  };

  const renameConversation = (id, title) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, title, updatedAt: new Date().toISOString() } : conversation));
  };

  const requestDelete = (id) => setConversationToDelete(conversations.find((conversation) => conversation.id === id) || null);

  const confirmDelete = () => {
    if (!conversationToDelete) return;
    revokeConversationPreviews(conversationToDelete);
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationToDelete.id));
    if (respondingConversationId === conversationToDelete.id) {
      if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
      setRespondingConversationId(null);
    }
    if (activeId === conversationToDelete.id) startNewConversation();
    setConversationToDelete(null);
  };

  const sendMessage = ({ content, attachments }) => {
    const now = new Date().toISOString();
    const conversationId = activeConversation?.id || createId("conversation");
    const title = content ? content.replace(/\s+/g, " ").slice(0, 52) : attachments[0]?.name || "Conversa com anexo";
    const userMessage = { id: createId("message"), conversationId, role: "user", content, attachments, createdAt: now };

    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === conversationId);
      if (existing) {
        return current.map((conversation) => conversation.id === conversationId ? { ...conversation, messages: [...conversation.messages, userMessage], updatedAt: now } : conversation);
      }
      return [{ id: conversationId, title, createdAt: now, updatedAt: now, messages: [userMessage] }, ...current];
    });
    setActiveId(conversationId);
    setRespondingConversationId(conversationId);

    responseTimerRef.current = window.setTimeout(() => {
      const respondedAt = new Date().toISOString();
      const assistantMessage = { id: createId("message"), conversationId, role: "assistant", content: SIMULATED_ASSISTANT_RESPONSE, attachments: [], createdAt: respondedAt };
      setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, messages: [...conversation.messages, assistantMessage], updatedAt: respondedAt } : conversation));
      setRespondingConversationId(null);
      responseTimerRef.current = null;
    }, 800);
  };

  const pageClasses = ["ai-assistant", historyOpen ? "ai-assistant--history-open" : "ai-assistant--history-closed"].join(" ");

  return (
    <section className={pageClasses}>
      <AiConversationSidebar conversations={conversations} activeId={activeId} open={historyOpen} onClose={() => setHistoryOpen(false)} onNew={startNewConversation} onSelect={selectConversation} onRename={renameConversation} onDelete={requestDelete} />
      {isMobile && historyOpen && <button type="button" className="ai-history-overlay" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico" />}
      <div className="ai-workspace">
        <AiConversationHeader
          conversation={activeConversation}
          historyOpen={historyOpen}
          onOpenHistory={() => setHistoryOpen(true)}
          onRename={(title) => renameConversation(activeId, title)}
          onDelete={() => requestDelete(activeId)}
        />
        <div className={`ai-conversation ${activeConversation ? "ai-conversation--active" : "ai-conversation--empty"}`}>
          {activeConversation ? (
            <AiMessageList conversationId={activeConversation.id} messages={activeConversation.messages} isResponding={respondingConversationId === activeConversation.id} />
          ) : (
            <AiEmptyState suggestions={AI_SUGGESTIONS} onSuggestion={setDraft} />
          )}
          <AiComposer value={draft} onChange={setDraft} onSend={sendMessage} isProcessing={Boolean(respondingConversationId)} resetKey={composerResetKey} />
        </div>
      </div>
      <AiDeleteDialog conversation={conversationToDelete} onCancel={() => setConversationToDelete(null)} onConfirm={confirmDelete} />
    </section>
  );
}

export default AiAssistant;
