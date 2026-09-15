import { useEffect, useMemo, useRef, useState } from "react";
import AiComposer from "../components/ai/AiComposer";
import AiConversationHeader from "../components/ai/AiConversationHeader";
import AiConversationSidebar from "../components/ai/AiConversationSidebar";
import AiDeleteDialog from "../components/ai/AiDeleteDialog";
import AiEmptyState from "../components/ai/AiEmptyState";
import AiMessageList from "../components/ai/AiMessageList";
import SystemNotification from "../components/SystemNotification";
import api from "../services/api";
import "../styles/ai-assistant.css";

const MOBILE_QUERY = "(max-width: 720px)";
const AI_SUGGESTIONS = ["Analisar um documento", "Resumir uma planilha", "Me ajudar com um processo", "Criar uma imagem"];

function revokeAttachments(attachments = []) {
  attachments.forEach((attachment) => {
    if (attachment.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(attachment.previewUrl);
  });
}

function AiAssistant() {
  const [conversations, setConversations] = useState([]);
  const [config, setConfig] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [historyOpen, setHistoryOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);
  const [respondingConversationId, setRespondingConversationId] = useState(null);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const conversationsRef = useRef(conversations);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    Promise.all([api.get("/ai/config"), api.get("/ai/conversations")])
      .then(([configResponse, conversationsResponse]) => { setConfig(configResponse.data); setConversations(conversationsResponse.data); })
      .catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar o Browninho." }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => { setIsMobile(event.matches); setHistoryOpen(!event.matches); };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  useEffect(() => () => {
    conversationsRef.current.forEach((conversation) => conversation.messages?.forEach((message) => revokeAttachments(message.attachments)));
  }, []);

  const activeConversation = useMemo(() => conversations.find((conversation) => String(conversation.id) === String(activeId)) || null, [activeId, conversations]);
  const startNewConversation = () => { setActiveId(null); setDraft(""); setNotice(null); setComposerResetKey((value) => value + 1); if (isMobile) setHistoryOpen(false); };
  const selectConversation = (id) => { setActiveId(id); setDraft(""); setNotice(null); setComposerResetKey((value) => value + 1); if (isMobile) setHistoryOpen(false); };

  const renameConversation = async (id, title) => {
    const previous = conversations.find((item) => String(item.id) === String(id));
    setConversations((current) => current.map((item) => String(item.id) === String(id) ? { ...item, title } : item));
    try { await api.patch(`/ai/conversations/${id}`, { title }); }
    catch (error) { setConversations((current) => current.map((item) => String(item.id) === String(id) ? { ...item, title: previous?.title || item.title } : item)); setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível renomear a conversa." }); }
  };
  const requestDelete = (id) => setConversationToDelete(conversations.find((item) => String(item.id) === String(id)) || null);
  const confirmDelete = async () => {
    if (!conversationToDelete) return;
    try { await api.delete(`/ai/conversations/${conversationToDelete.id}`); setConversations((current) => current.filter((item) => String(item.id) !== String(conversationToDelete.id))); if (String(activeId) === String(conversationToDelete.id)) startNewConversation(); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível excluir a conversa." }); }
    finally { setConversationToDelete(null); }
  };

  const sendMessage = async ({ content, attachments }) => {
    const existingId = activeConversation?.id || null;
    const temporaryId = existingId || `temporary-${Date.now()}`;
    const now = new Date().toISOString();
    const temporaryMessage = { id: `message-${Date.now()}`, conversationId: temporaryId, role: "user", content, attachments, createdAt: now };
    const title = content.replace(/\s+/g, " ").slice(0, 80) || attachments[0]?.name || "Nova conversa";
    setNotice(null);
    setConversations((current) => existingId ? current.map((item) => String(item.id) === String(existingId) ? { ...item, messages: [...item.messages, temporaryMessage], updatedAt: now } : item) : [{ id: temporaryId, title, createdAt: now, updatedAt: now, messages: [temporaryMessage] }, ...current]);
    setActiveId(temporaryId); setRespondingConversationId(temporaryId);
    const data = new FormData(); data.append("content", content); if (existingId) data.append("conversationId", existingId); attachments.forEach((attachment) => data.append("files", attachment.file, attachment.name));
    try {
      const response = await api.post("/ai/messages", data);
      const { conversationId, userMessage, assistantMessage } = response.data;
      revokeAttachments(attachments);
      setConversations((current) => current.map((item) => String(item.id) === String(temporaryId) ? { ...item, id: conversationId, messages: [...item.messages.filter((message) => message.id !== temporaryMessage.id), userMessage, assistantMessage], updatedAt: assistantMessage.createdAt } : item));
      setActiveId(conversationId);
    } catch (error) {
      setConversations((current) => existingId ? current.map((item) => String(item.id) === String(existingId) ? { ...item, messages: item.messages.filter((message) => message.id !== temporaryMessage.id) } : item) : current.filter((item) => String(item.id) !== String(temporaryId)));
      if (!existingId) setActiveId(null);
      setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível obter uma resposta do Browninho." });
    } finally { setRespondingConversationId(null); }
  };

  const unavailable = config && (!config.enabled || !config.configured);
  return <section className={`ai-assistant ${historyOpen ? "ai-assistant--history-open" : "ai-assistant--history-closed"}`}>
    <AiConversationSidebar conversations={conversations} activeId={activeId} open={historyOpen} onClose={() => setHistoryOpen(false)} onNew={startNewConversation} onSelect={selectConversation} onRename={renameConversation} onDelete={requestDelete} />
    {isMobile && historyOpen && <button type="button" className="ai-history-overlay" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico" />}
    <div className="ai-workspace"><AiConversationHeader conversation={activeConversation} historyOpen={historyOpen} onOpenHistory={() => setHistoryOpen(true)} onRename={(title) => renameConversation(activeId, title)} onDelete={() => requestDelete(activeId)} />
      <div className={`ai-conversation ${activeConversation ? "ai-conversation--active" : "ai-conversation--empty"}`}>
        {notice && <div className="ai-notice"><SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification></div>}
        {unavailable && <div className="ai-notice"><SystemNotification variant="warning">{config.enabled ? "O administrador precisa configurar a chave da OpenAI no servidor." : "O Browninho está desabilitado pelo administrador."}</SystemNotification></div>}
        {activeConversation ? <AiMessageList conversationId={activeConversation.id} messages={activeConversation.messages} isResponding={respondingConversationId === activeConversation.id} /> : <AiEmptyState suggestions={AI_SUGGESTIONS} onSuggestion={setDraft} />}
        <AiComposer value={draft} onChange={setDraft} onSend={sendMessage} isProcessing={loading || Boolean(respondingConversationId)} disabled={Boolean(unavailable)} resetKey={composerResetKey} capabilities={config?.capabilities} />
      </div>
    </div>
    <AiDeleteDialog conversation={conversationToDelete} onCancel={() => setConversationToDelete(null)} onConfirm={confirmDelete} />
  </section>;
}

export default AiAssistant;
