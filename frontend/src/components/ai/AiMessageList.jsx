import { useEffect, useRef } from "react";
import AiMessage from "./AiMessage";
import AiTypingIndicator from "./AiTypingIndicator";

function AiMessageList({ conversationId, messages, isResponding }) {
  const scrollRef = useRef(null);
  const shouldFollowRef = useRef(true);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  useEffect(() => {
    shouldFollowRef.current = true;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [conversationId]);

  useEffect(() => {
    if (!shouldFollowRef.current) return;
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages, isResponding]);

  return (
    <div className="ai-message-list" ref={scrollRef} onScroll={handleScroll}>
      <div className="ai-message-list__inner">
        {messages.map((message) => <AiMessage key={message.id} message={message} />)}
        {isResponding && <AiTypingIndicator />}
      </div>
    </div>
  );
}

export default AiMessageList;
