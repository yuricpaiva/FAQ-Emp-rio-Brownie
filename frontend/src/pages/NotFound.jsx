import { Link } from "react-router-dom";
import { Home, Search } from "lucide-react";

function NotFound() {
  return (
    <section className="not-found surface-card" aria-labelledby="not-found-title">
      <span className="not-found__code" aria-hidden="true">404</span>
      <h1 id="not-found-title">Esta página não foi encontrada</h1>
      <p>O endereço pode ter mudado ou não estar disponível para o seu perfil.</p>
      <div className="not-found__actions">
        <Link className="button" to="/"><Home size={17} aria-hidden="true" /> Voltar ao início</Link>
        <Link className="button button--ghost" to="/?buscar=1"><Search size={17} aria-hidden="true" /> Pesquisar no FAQ</Link>
      </div>
    </section>
  );
}

export default NotFound;
