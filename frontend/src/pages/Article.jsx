import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import api from "../services/api";

function Article() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get(`/knowledge/articles/${slug}`)
      .then((res) => {
        setArticle(res.data);
        setNotFound(false);
      })
      .catch(() => {
        setArticle(null);
        setNotFound(true);
      });
  }, [slug]);

  const articleMeta = useMemo(() => {
    if (!article) return null;

    const createdAt = new Date(article.createdAt);
    const updatedAt = new Date(article.updatedAt);
    const wasUpdated = createdAt.getTime() !== updatedAt.getTime();

    return {
      label: wasUpdated ? "Atualizado por" : "Criado por",
      name: article.updatedBy || article.author,
      photoUrl: article.authorPhoto || "",
      dateLabel: (wasUpdated ? "Em " : "Em ") + updatedAt.toLocaleDateString("pt-BR"),
      initials:
        (article.updatedBy || article.author || "US")
          .split(" ")
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase())
          .join("")
          .slice(0, 2) || "US",
    };
  }, [article]);

  if (notFound) {
    return <p className="empty-state">Artigo não encontrado.</p>;
  }

  if (!article || !articleMeta) {
    return <div className="surface-card">Carregando artigo...</div>;
  }

  return (
    <article className="article-detail">
      <div className="article-detail__header">
        <div className="article-detail__badges">
          <span>{article.category}</span>
          <span>{article.status === "draft" ? "Rascunho" : "Publicado"}</span>
        </div>
        <h1>{article.title}</h1>
        {article.summary && <p className="article-detail__summary">{article.summary}</p>}

        <div className="article-detail__author">
          {articleMeta.photoUrl ? (
            <img src={articleMeta.photoUrl} alt={articleMeta.name} className="article-detail__author-avatar" />
          ) : (
            <div className="article-detail__author-avatar article-detail__author-avatar--fallback">
              {articleMeta.initials}
            </div>
          )}
          <div className="article-detail__author-copy">
            <span>{articleMeta.label}</span>
            <strong>{articleMeta.name}</strong>
          </div>
          <span className="article-detail__author-date">{articleMeta.dateLabel}</span>
        </div>
      </div>

      <div
        className="article-detail__content prose"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content) }}
      />
    </article>
  );
}

export default Article;
