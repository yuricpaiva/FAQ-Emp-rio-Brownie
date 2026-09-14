function AiTypingIndicator() {
  return (
    <div className="ai-typing" role="status" aria-live="polite">
      <span className="ai-message__avatar" aria-hidden="true"><img src="/browninho.png" alt="" /></span>
      <div>
        <strong>Browninho</strong>
        <span className="ai-typing__dots" aria-label="Respondendo">
          <i /><i /><i />
        </span>
      </div>
    </div>
  );
}

export default AiTypingIndicator;
