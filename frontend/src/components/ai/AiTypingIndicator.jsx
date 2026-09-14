import { Sparkles } from "lucide-react";

function AiTypingIndicator() {
  return (
    <div className="ai-typing" role="status" aria-live="polite">
      <span className="ai-message__avatar" aria-hidden="true"><Sparkles size={15} /></span>
      <div>
        <strong>Assistente IA</strong>
        <span className="ai-typing__dots" aria-label="Respondendo">
          <i /><i /><i />
        </span>
      </div>
    </div>
  );
}

export default AiTypingIndicator;
