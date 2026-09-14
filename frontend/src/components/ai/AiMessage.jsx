import { useEffect, useRef, useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import AiAttachmentPreview from "./AiAttachmentPreview";
import AiRichText, { copyText } from "./AiRichText";

function AiMessage({ message }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState("");
  const copiedTimerRef = useRef(null);
  const isAssistant = message.role === "assistant";

  const handleCopy = async () => {
    await copyText(message.content);
    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => () => {
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
  }, []);

  return (
    <article className={`ai-message ai-message--${message.role}`}>
      <div className="ai-message__body">
        {isAssistant && (
          <div className="ai-message__identity">
            <span className="ai-message__avatar" aria-hidden="true"><img src="/browninho.png" alt="" /></span>
            <strong>Browninho</strong>
          </div>
        )}
        <div className="ai-message__content">
          {isAssistant ? <AiRichText content={message.content} /> : <p>{message.content}</p>}
          {message.attachments?.length > 0 && (
            <div className="ai-message__attachments">
              {message.attachments.map((attachment) => <AiAttachmentPreview key={attachment.id} attachment={attachment} compact />)}
            </div>
          )}
        </div>
        {isAssistant && (
          <div className="ai-message__actions" aria-label="Ações da resposta">
            <button type="button" onClick={handleCopy} title="Copiar resposta">
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? "Copiado" : "Copiar"}</span>
            </button>
            <button type="button" className={feedback === "up" ? "is-active" : ""} onClick={() => setFeedback((value) => value === "up" ? "" : "up")} aria-label="Resposta útil" title="Resposta útil"><ThumbsUp size={15} /></button>
            <button type="button" className={feedback === "down" ? "is-active" : ""} onClick={() => setFeedback((value) => value === "down" ? "" : "down")} aria-label="Resposta não foi útil" title="Resposta não foi útil"><ThumbsDown size={15} /></button>
          </div>
        )}
      </div>
    </article>
  );
}

export default AiMessage;
