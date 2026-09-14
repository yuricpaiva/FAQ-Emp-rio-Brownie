import { FileSearch, Image, ListChecks, Sparkles, TableProperties } from "lucide-react";

const ICONS = [FileSearch, TableProperties, ListChecks, Image];

function AiEmptyState({ suggestions, onSuggestion }) {
  return (
    <div className="ai-empty-state">
      <span className="ai-empty-state__mark" aria-hidden="true"><Sparkles size={25} /></span>
      <h1>Como posso ajudar?</h1>
      <p>Converse com o Assistente IA do FAQ EB.</p>
      <div className="ai-empty-state__suggestions" aria-label="Sugestões de mensagem">
        {suggestions.map((suggestion, index) => {
          const Icon = ICONS[index];
          return <button type="button" key={suggestion} onClick={() => onSuggestion(suggestion)}><Icon size={17} /><span>{suggestion}</span></button>;
        })}
      </div>
    </div>
  );
}

export default AiEmptyState;
