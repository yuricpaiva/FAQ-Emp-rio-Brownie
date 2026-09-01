import Breadcrumbs from "./Breadcrumbs";

function PageHeader({ actions, breadcrumbs, description, eyebrow, title }) {
  return (
    <header className="ui-page-header">
      <Breadcrumbs items={breadcrumbs} />
      <div className="ui-page-header__row">
        <div className="ui-page-header__copy">
          {eyebrow && <span className="ui-page-header__eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="ui-page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}

export default PageHeader;
