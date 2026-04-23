import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import { getCategoryIcon } from "../constants/categoryIcons";

function Category() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api
      .get("/knowledge/categories")
      .then((res) => {
        const match = res.data.find((item) => item.slug === slug);
        setCategory(match || null);
      })
      .catch(() => setCategory(null));
  }, [slug]);

  useEffect(() => {
    api
      .get("/knowledge/articles", { params: { category: slug } })
      .then((res) => setArticles(res.data))
      .catch(() => setArticles([]));
  }, [slug]);

  const title = useMemo(() => category?.name || "Categoria", [category]);

  return (
    <section className="page-stack">
      <div className="hero-card hero-card--compact">
        <div>
          <p className="eyebrow">Categoria</p>
          <h1>{title}</h1>
          <p className="hero-card__copy">{articles.length} artigo(s) encontrado(s) nesta área.</p>
        </div>
        {category && (
          <div className="hero-card__icon">
            <img src={getCategoryIcon(category.iconKey)} alt={category.name} />
          </div>
        )}
      </div>

      <div className="article-grid">
        {articles.map((article) => (
          <Link key={article.id} to={`/artigo/${article.slug}`} className="article-card">
            <div className="article-card__meta">
              <span>{article.status === "draft" ? "Rascunho" : "Publicado"}</span>
              <span>{new Date(article.updatedAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <h2>{article.title}</h2>
            <p>{article.summary || "Sem resumo cadastrado."}</p>
            <small>Por {article.author}</small>
          </Link>
        ))}
        {!articles.length && <p className="empty-state">Nenhum artigo disponível nesta categoria.</p>}
      </div>
    </section>
  );
}

export default Category;
