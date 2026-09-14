import { FileText, Image, X } from "lucide-react";

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AiAttachmentPreview({ attachment, compact = false, onRemove }) {
  const isImage = attachment.type?.startsWith("image/");

  return (
    <div className={`ai-attachment ${compact ? "ai-attachment--compact" : ""}`}>
      <div className="ai-attachment__visual" aria-hidden="true">
        {isImage && attachment.previewUrl ? (
          <img src={attachment.previewUrl} alt="" />
        ) : isImage ? (
          <Image size={17} />
        ) : (
          <FileText size={17} />
        )}
      </div>
      <span className="ai-attachment__copy">
        <strong title={attachment.name}>{attachment.name}</strong>
        {!compact && <small>{formatFileSize(attachment.size)}</small>}
      </span>
      {onRemove && (
        <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remover ${attachment.name}`} title="Remover anexo">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default AiAttachmentPreview;
