function formatPercent(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function ProductionProgressBar({ value, title, ariaLabel, detail = "" }) {
  const numericValue = Number(value);
  const progress = Number.isFinite(numericValue)
    ? Math.min(100, Math.max(0, numericValue))
    : 0;
  const formattedProgress = formatPercent(progress);

  return (
    <div className="production-day-weight" title={title}>
      <div
        className="production-day-weight__track"
        role="progressbar"
        aria-label={ariaLabel || `${formattedProgress}%`}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <strong>{formattedProgress}%</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
