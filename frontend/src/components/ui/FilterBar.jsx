function FilterBar({ actions, children, className = "" }) {
  return <div className={`ui-filter-bar ${className}`.trim()}><div className="ui-filter-bar__fields">{children}</div>{actions && <div className="ui-filter-bar__actions">{actions}</div>}</div>;
}

export default FilterBar;
