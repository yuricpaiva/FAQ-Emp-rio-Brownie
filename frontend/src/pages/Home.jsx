import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { getCategoryIcon } from "../constants/categoryIcons";
import { useAuth } from "../context/AuthContext";

function Home() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [recentArticles, setRecentArticles] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [query, setQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    api
      .get("/knowledge/categories")
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    api
      .get("/knowledge/articles", { params: { status: "published" } })
      .then((res) => {
        const recent = [...res.data]
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5);
        setRecentArticles(recent);
      })
      .catch(() => setRecentArticles([]));
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setLoadingSearch(false);
      return undefined;
    }

    let active = true;
    setLoadingSearch(true);

    const timeout = window.setTimeout(async () => {
      try {
        const res = await api.get("/knowledge/articles", {
          params: { q: trimmedQuery, status: "published" },
        });
        if (active) {
          setSearchResults(res.data);
        }
      } catch {
        if (active) {
          setSearchResults([]);
        }
      } finally {
        if (active) {
          setLoadingSearch(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const firstName = useMemo(() => {
    const fullName = user?.name?.trim() || "";
    return fullName.split(/\s+/)[0] || "usuário";
  }, [user]);

  return (
    <section className="page-stack">
      <div className="hero-card">
        <div>
          <h1>Bem vindo(a), {firstName}</h1>
          <p className="hero-card__copy">
            Consulte processos, tire dúvidas e acompanhe conteúdos que ajudam você a
            resolver demandas do dia a dia com mais autonomia.
          </p>
        </div>
        <div className="hero-card__media">
          <img src="/brand-placeholder.png" alt="FAQ Empório Brownie" />
        </div>
      </div>

      <div className="search-panel">
        <label className="search-panel__label" htmlFor="global-search">
          Pesquisa de artigos
        </label>
        <div className="search-panel__field">
          <input
            id="global-search"
            className="search-input"
            type="text"
            placeholder="Pesquise por título, resumo, autor, categoria ou conteúdo..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {query.trim() && (
            <div className="search-dropdown">
              {loadingSearch ? (
                <p className="search-dropdown__empty">Buscando...</p>
              ) : searchResults.length ? (
                searchResults.map((article, index) => (
                  <Link
                    key={article.id}
                    to={`/artigo/${article.slug}`}
                    className="search-dropdown__item"
                    style={{
                      borderBottom: index === searchResults.length - 1 ? "none" : undefined,
                    }}
                  >
                    <strong>{article.title}</strong>
                    <span>
                      {article.category} • {new Date(article.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="search-dropdown__empty">Nenhum artigo encontrado.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="content-grid">
        <section className="surface-card">
          <div className="section-heading">
            <div>
              <h2>Categorias</h2>
            </div>
          </div>
          <div className="category-grid">
            {categories.map((category) => (
              <Link key={category.id} to={`/categoria/${category.slug}`} className="category-tile">
                <img src={getCategoryIcon(category.iconKey)} alt={category.name} />
                <div>
                  <strong>{category.name}</strong>
                  <span>{category.articleCount} artigos</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="surface-card">
          <div className="section-heading">
            <div>
              <h2>Artigos recentes</h2>
            </div>
          </div>
          <div className="article-list">
            {recentArticles.map((article) => (
              <Link key={article.id} to={`/artigo/${article.slug}`} className="article-list__item">
                <div className="article-list__meta">
                  <span>{article.category}</span>
                  <span>Postado em {new Date(article.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <strong>{article.title}</strong>
                <p>{article.summary || "Sem resumo cadastrado."}</p>
                <small>Por {article.author}</small>
              </Link>
            ))}
            {!recentArticles.length && (
              <p className="empty-state">Nenhum artigo publicado recentemente.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export default Home;
