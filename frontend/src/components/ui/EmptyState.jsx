function EmptyState({ action, children = "Nenhum registro encontrado.", title }) {
  return <div className="ui-empty-state">{title && <strong>{title}</strong>}<p>{children}</p>{action}</div>;
}

export default EmptyState;
