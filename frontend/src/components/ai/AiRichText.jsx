import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (_error) {
      // Usa o fallback abaixo quando o navegador bloquear a Clipboard API.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CodeBlock({ children, className = "" }) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);
  const language = className.replace("language-", "") || "código";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await copyText(code);
    setCopied(true);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
  };

  useEffect(() => () => {
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
  }, []);

  return (
    <div className="ai-code-block">
      <div className="ai-code-block__header">
        <span>{language}</span>
        <button type="button" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre><code className={className}>{code}</code></pre>
    </div>
  );
}

function AiRichText({ content }) {
  return (
    <div className="ai-rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          code: ({ node: _node, className, children, ...props }) => {
            const isBlock = Boolean(className?.startsWith("language-") || String(children).includes("\n"));
            return isBlock ? <CodeBlock className={className}>{children}</CodeBlock> : <code className={className} {...props}>{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ node: _node, ...props }) => <div className="ai-rich-text__table"><table {...props} /></div>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export { copyText };
export default AiRichText;
