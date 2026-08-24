export const FEATURE_ICON_OPTIONS = [
  ["laptop", "Notebook"], ["tv", "TV"], ["capacity", "Capacidade"],
  ["projector", "Projetor"], ["wifi", "Wi-Fi"], ["video", "Videoconferência"],
  ["parking", "Estacionamento"], ["accessibility", "Acessibilidade"],
  ["air", "Ar-condicionado"], ["charger", "Carregador"],
  ["os", "Sistema operacional"], ["asset", "Patrimônio"],
  ["location", "Localização"], ["other", "Outro"],
];

function FeatureIcon({ name }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    laptop: <><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19h19"/></>,
    tv: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 2 3 3 3-3"/></>,
    capacity: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.5-4 2.2-6 5-6s4.5 2 5 6M14 15c3.8-.8 6 .8 6.5 4"/></>,
    projector: <><rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="16.5" cy="12" r="2.5"/><path d="M7 17v3M17 17v3"/></>,
    wifi: <><path d="M3 9c5-4 13-4 18 0M6 13c3.5-2.8 8.5-2.8 12 0M9.5 17c1.5-1 3.5-1 5 0"/><circle cx="12" cy="20" r=".8" fill="currentColor"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
    parking: <><circle cx="12" cy="12" r="10"/><path d="M9 18V6h4a4 4 0 0 1 0 8H9"/></>,
    accessibility: <><circle cx="12" cy="4" r="2"/><path d="M6 8h12M12 6v6l-4 8M12 12l5 8"/></>,
    air: <><path d="M3 8h11c3 0 3-4 0-4M3 12h16c3 0 3 4 0 4M3 16h8"/></>,
    charger: <><path d="M9 3h6v5h3v6a6 6 0 0 1-12 0V8h3zM10 3V1M14 3V1"/></>,
    os: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h8v8H8z"/></>,
    asset: <><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 12h8M12 8v8"/></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></>,
    other: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name] || paths.other}</svg>;
}

export default function ResourceFeatures({ resource, compact = false }) {
  const definitions = resource?.type?.attributeDefinitions || [];
  const attributes = resource?.attributes || {};
  const features = definitions.flatMap((definition) => {
    const value = attributes[definition.key];
    if (definition.type === "BOOLEAN" && value !== true) return [];
    if (definition.type !== "BOOLEAN" && (value === undefined || value === null || value === "")) return [];
    return [{ ...definition, value }];
  });
  if (!features.length) return null;
  return <div className={`resource-features ${compact ? "resource-features--compact" : ""}`}>
    {features.map((feature) => {
      const label = feature.type === "BOOLEAN" ? feature.label : `${feature.label}: ${feature.value}`;
      return <span key={feature.key} className="resource-feature" title={label} aria-label={label}>
        <FeatureIcon name={feature.icon} />
        {!compact && <small>{label}</small>}
      </span>;
    })}
  </div>;
}
