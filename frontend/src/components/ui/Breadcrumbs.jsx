import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

function Breadcrumbs({ items = [] }) {
  if (items.length < 2) return null;

  return (
    <nav className="ui-breadcrumbs" aria-label="Navegação estrutural">
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
              {item.to && !current ? <Link to={item.to}>{item.label}</Link> : <span aria-current={current ? "page" : undefined}>{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
