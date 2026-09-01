function LoadingState({ label = "Carregando..." }) {
  return <div className="ui-loading-state" role="status"><span className="ui-spinner" aria-hidden="true" /><span>{label}</span></div>;
}

export default LoadingState;
