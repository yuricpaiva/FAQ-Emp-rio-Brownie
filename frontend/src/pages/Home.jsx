import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, ChevronRight, ClipboardCheck, FileText, LayoutDashboard, PackageCheck, Search, X } from "lucide-react";
import api from "../services/api";
import { getCategoryIcon } from "../constants/categoryIcons";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui";

function Home() {
  const { user, hasRole } = useAuth();
  const [categories, setCategories] = useState([]);
  const [recentArticles, setRecentArticles] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [query, setQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [access, setAccess] = useState({ forms: false, powerBi: false });

  useEffect(() => { api.get("/knowledge/categories").then((response) => setCategories(response.data)).catch(() => setCategories([])); }, []);
  useEffect(() => {
    api.get("/knowledge/articles", { params: { status: "published" } }).then((response) => setRecentArticles([...response.data].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6))).catch(() => setRecentArticles([]));
  }, []);
  useEffect(() => {
    Promise.allSettled([api.get("/forms/access"), api.get("/knowledge/power-bi-config")]).then(([forms, powerBi]) => setAccess({
      forms: forms.status === "fulfilled" && Boolean(forms.value.data.hasAccess),
      powerBi: powerBi.status === "fulfilled" && Boolean(powerBi.value.data.enabled && powerBi.value.data.hasAccess),
    }));
  }, []);
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) { setSearchResults([]); setLoadingSearch(false); return undefined; }
    let active = true; setLoadingSearch(true);
    const timeout = window.setTimeout(async () => {
      try { const response = await api.get("/knowledge/articles", { params: { q: trimmedQuery, status: "published" } }); if (active) setSearchResults(response.data); }
      catch { if (active) setSearchResults([]); }
      finally { if (active) setLoadingSearch(false); }
    }, 180);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [query]);

  const firstName = useMemo(() => user?.name?.trim().split(/\s+/)[0] || "usuário", [user]);
  const quickLinks = useMemo(() => {
    const links = [{ to: "/reservas", label: "Reservas", icon: CalendarDays }];
    if (hasRole(["admin", "production_manager"])) links.unshift({ to: "/planejamento-producao", label: "Planejamento", icon: ClipboardCheck });
    if (hasRole(["store", "admin", "production_manager"])) links.push({ to: "/contagem-estoque", label: "Contagem de estoque", icon: PackageCheck });
    if (access.forms) links.push({ to: "/forms/preenchimentos", label: "Formulários", icon: FileText });
    if (access.powerBi) links.push({ to: "/power-bi", label: "Power BI", icon: BarChart3 });
    if (hasRole(["creator", "admin"])) links.push({ to: "/admin/dashboard", label: "Painel", icon: LayoutDashboard });
    return links;
  }, [access, hasRole]);

  return <section className="page-stack home-page">
    <PageHeader eyebrow="Sistema interno" title={`Olá, ${firstName}`} description="Consulte o conhecimento e acesse as rotinas disponíveis para o seu perfil." />

    <div className="home-search">
      <label htmlFor="global-search">Pesquisar na base de conhecimento</label>
      <div className="home-search__field">
        <Search size={17} aria-hidden="true" />
        <input id="global-search" type="search" placeholder="Título, resumo, autor, categoria ou conteúdo" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
        {query && <button type="button" className="ui-icon-button home-search__clear" onClick={() => setQuery("")} aria-label="Limpar pesquisa"><X size={15} /></button>}
        {query.trim() && <div className="search-dropdown">
          {loadingSearch ? <p className="search-dropdown__empty">Buscando...</p> : searchResults.length ? searchResults.map((article) => <Link key={article.id} to={`/artigo/${article.slug}`} className="search-dropdown__item"><strong>{article.title}</strong><span>{article.category} · {new Date(article.createdAt).toLocaleDateString("pt-BR")}</span></Link>) : <p className="search-dropdown__empty">Nenhum artigo encontrado.</p>}
        </div>}
      </div>
    </div>

    {quickLinks.length > 0 && <section className="home-section" aria-labelledby="home-actions-title"><div className="home-section__header"><h2 id="home-actions-title">Acessos frequentes</h2></div><div className="home-quick-links">{quickLinks.map(({ icon: Icon, ...link }) => <Link to={link.to} className="home-quick-link" key={link.to}><Icon aria-hidden="true" /><span>{link.label}</span></Link>)}</div></section>}

    <div className="home-content-grid">
      <section className="home-section" aria-labelledby="home-categories-title">
        <div className="home-section__header"><h2 id="home-categories-title">Categorias</h2><span>{categories.length}</span></div>
        <div className="home-list">{categories.map((category) => <Link key={category.id} to={`/categoria/${category.slug}`} className="home-list__row"><span className="home-list__primary"><img src={getCategoryIcon(category.iconKey)} alt="" className="home-list__category-icon" /><span className="home-list__copy"><strong>{category.name}</strong><span>{category.articleCount} artigos</span></span></span><ChevronRight size={15} aria-hidden="true" /></Link>)}{!categories.length && <p className="home-list__empty">Nenhuma categoria disponível.</p>}</div>
      </section>
      <section className="home-section" aria-labelledby="home-recent-title">
        <div className="home-section__header"><h2 id="home-recent-title">Artigos recentes</h2><span>Últimas publicações</span></div>
        <div className="home-list">{recentArticles.map((article) => <Link key={article.id} to={`/artigo/${article.slug}`} className="home-list__row"><span className="home-list__copy"><strong>{article.title}</strong><span>{article.category} · {new Date(article.updatedAt || article.createdAt).toLocaleDateString("pt-BR")}</span></span><ChevronRight size={15} aria-hidden="true" /></Link>)}{!recentArticles.length && <p className="home-list__empty">Nenhum artigo publicado recentemente.</p>}</div>
      </section>
    </div>
  </section>;
}

export default Home;
