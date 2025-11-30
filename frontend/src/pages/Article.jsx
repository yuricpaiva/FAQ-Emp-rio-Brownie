import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";

function Article() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const initials =
    article?.author
      ?.split(" ")
      .filter(Boolean)
      .map((word) => word[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "AU";

  useEffect(() => {
    api
      .get(`/articles/${slug}`)
      .then((res) => {
        setArticle(res.data);
        setNotFound(false);
      })
      .catch(() => {
        setArticle(null);
        setNotFound(true);
      });
  }, [slug]);

  if (notFound) {
    return <p>Artigo não encontrado.</p>;
  }

  if (!article) {
    return <p>Carregando...</p>;
  }

  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #e3d6cb",
        borderRadius: "18px",
        padding: "2.5rem",
        boxShadow: "0 12px 28px rgba(0,0,0,0.08)",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.75rem",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "0.35rem 0.75rem",
            borderRadius: "999px",
            background: "#71594E",
            color: "#f3e6df",
            fontWeight: 700,
            fontSize: "0.9rem",
          }}
        >
          {article.category}
        </span>
        <span style={{ fontSize: "0.9rem", color: "#8b7468" }}>
          Atualizado em{" "}
          {new Date(article.updatedAt).toLocaleDateString("pt-BR")}
          {article.updatedBy ? ` por ${article.updatedBy}` : ""}
        </span>
      </div>

      <h1
        style={{
          fontSize: "2.2rem",
          fontWeight: 800,
          margin: "0 0 1rem",
          color: "#4a372f",
        }}
      >
        {article.title}
      </h1>

      {article.author && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          {article.authorPhoto ? (
            <img
              src={article.authorPhoto}
              alt={article.author}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #e3d6cb",
              }}
            />
          ) : (
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#71594E",
                color: "#f3e6df",
                display: "grid",
                placeItems: "center",
                fontWeight: 800,
              }}
            >
              {initials}
            </div>
          )}
          <p style={{ margin: 0, color: "#71594E", fontWeight: 700 }}>
            {article.author}
          </p>
        </div>
      )}

      <div
        style={{
          color: "#4a372f",
          lineHeight: 1.7,
          fontSize: "1rem",
          overflow: "hidden",
          width: "100%",
        }}
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
      <style>
        {`
          .prose img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1rem auto;
            border-radius: 12px;
          }
        `}
      </style>
    </article>
  );
}

export default Article;
