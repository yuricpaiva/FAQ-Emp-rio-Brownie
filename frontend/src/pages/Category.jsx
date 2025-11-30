import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";

function Category() {
  const { categoria } = useParams();
  const [articles, setArticles] = useState([]);

  useEffect(() => {
    api
      .get("/articles")
      .then((res) => {
        const filtered = res.data.filter((item) => item.category === decodeURIComponent(categoria));
        setArticles(filtered);
      })
      .catch(() => setArticles([]));
  }, [categoria]);

  const formattedCategory = useMemo(() => decodeURIComponent(categoria), [categoria]);

  const formatDate = (date) =>
    new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const getExcerpt = (html) => {
    const plain = html.replace(/<[^>]+>/g, "").trim();
    if (plain.length <= 160) return plain;
    return `${plain.slice(0, 160)}...`;
  };

  return (
    <section
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        color: "#71594E",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #71594E, #594238)",
          borderRadius: "18px",
          padding: "1.5rem",
          border: "1px solid #5f4a41",
          marginBottom: "1.2rem",
          boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
          color: "#f3e6df",
        }}
      >
        <p style={{ margin: 0, color: "#f6eae2", fontWeight: 700 }}>Categoria</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.35rem" }}>
          <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 800 }}>{formattedCategory}</h1>
          <span
            style={{
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              background: "#f3e6df",
              color: "#71594E",
              fontWeight: 700,
              fontSize: "0.9rem",
            }}
          >
            {articles.length} {articles.length === 1 ? "artigo" : "artigos"}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
        }}
      >
        {articles.map((article) => (
          <Link
            key={article.id}
            to={`/artigo/${article.slug}`}
            style={{
              display: "block",
              background: "#fff",
              border: "1px solid #e3d6cb",
              borderRadius: "16px",
              padding: "1.1rem",
              boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
              textDecoration: "none",
              color: "#71594E",
              transition: "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.12)";
              e.currentTarget.style.borderColor = "#d7c7bc";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)";
              e.currentTarget.style.borderColor = "#e3d6cb";
            }}
          >
            <p style={{ margin: 0, color: "#8b7468", fontSize: "0.9rem" }}>
              Atualizado em {formatDate(article.updatedAt)}
            </p>
            <h2 style={{ margin: "0.3rem 0 0.5rem", fontSize: "1.2rem", fontWeight: 800 }}>
              {article.title}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem" }}>
              <p style={{ margin: 0, color: "#71594E", fontWeight: 700 }}>Por:</p>
              {article.authorPhoto ? (
                <img
                  src={article.authorPhoto}
                  alt={article.author}
                  style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#71594E",
                    color: "#f3e6df",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                  }}
                >
                  {(article.author || "AU")
                    .split(" ")
                    .filter(Boolean)
                    .map((w) => w[0]?.toUpperCase())
                    .join("")
                    .slice(0, 2)}
                </div>
              )}
              <p style={{ margin: 0, color: "#71594E", fontWeight: 700 }}>
                {article.author || "Autor"}
              </p>
            </div>
          </Link>
        ))}
        {articles.length === 0 && (
          <p style={{ gridColumn: "1 / -1", textAlign: "center" }}>Nenhum artigo nesta categoria.</p>
        )}
      </div>
    </section>
  );
}

export default Category;
