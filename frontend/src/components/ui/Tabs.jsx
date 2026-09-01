function Tabs({ ariaLabel, items, onChange, value }) {
  return <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>{items.map((item) => <button type="button" role="tab" aria-selected={value === item.value} className={value === item.value ? "active" : ""} onClick={() => onChange(item.value)} key={item.value}>{item.label}</button>)}</div>;
}

export default Tabs;
