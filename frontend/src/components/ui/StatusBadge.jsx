function StatusBadge({ children, className = "", tone = "neutral" }) {
  return <span className={`ui-status-badge ui-status-badge--${tone} ${className}`.trim()}>{children}</span>;
}

export default StatusBadge;
