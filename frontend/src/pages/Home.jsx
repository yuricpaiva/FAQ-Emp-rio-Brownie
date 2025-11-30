import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

function Home() {
  const categories = [
    "Operação",
    "Gente & Gestão",
    "TI",
    "Controladoria & Financeiro",
    "Comercial",
    "Marketing",
  ];
  const categoryIcons = {
    Operação: "/icon-operacao.svg",
    "Gente & Gestão": "/icon-gente-gestao.svg",
    TI: "/icon-ti.svg",
    "Controladoria & Financeiro": "/icon-controladoria-financeiro.svg",
    Comercial: "/icon-comercial.svg",
    Marketing: "/icon-marketing.svg",
  };
  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .get("/articles")
      .then((res) => setArticles(res.data))
      .catch(() => setArticles([]));
  }, []);

  const filteredArticles = articles.filter((article) =>
    article.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const highlightMatch = (text) => {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return text.replace(regex, "<strong>$1</strong>");
  };

  return (
    <section style={{ maxWidth: "960px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "1.5rem",
        }}
      >
        <img
          src="/brand-placeholder.png"
          alt="Professor Brownito"
          style={{
            width: "300px",
            height: "170px",
            objectFit: "contain",
            borderRadius: "16px",
          }}
        />
        <h1 style={{ fontSize: "1.6rem", fontWeight: 900 }}>
          Professor Brownito
        </h1>
      </div>

      <div
        style={{
          margin: "0 auto 1.5rem",
          position: "relative",
          zIndex: 5,
          width: "70%",
          maxWidth: "520px",
          minWidth: "260px",
        }}
      >
        <input
          type="text"
          placeholder="Pesquisar tópicos por título..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "0.7rem 1rem",
            borderRadius: "100px",
            border: "1px solid #d7c7bc",
            fontSize: "1rem",
            color: "#71594e",
            outline: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          }}
        />
        {query.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 0.4rem)",
              left: 0,
              width: "100%",
              background: "#fff",
              borderRadius: "16px",
              border: "1px solid #e6d8ce",
              overflow: "hidden",
              boxShadow: "0 10px 24px rgba(0,0,0,0.15)",
            }}
          >
            {filteredArticles.length === 0 && (
              <p style={{ padding: "0.75rem 1rem" }}>
                Nenhum tópico encontrado.
              </p>
            )}
            {filteredArticles.map((article, index) => (
              <Link
                key={article.id}
                to={`/artigo/${article.slug}`}
                style={{
                  display: "block",
                  padding: "0.85rem 1rem",
                  borderBottom:
                    index === filteredArticles.length - 1
                      ? "none"
                      : "1px solid #f0e6df",
                  color: "#71594e",
                  textDecoration: "none",
                }}
              >
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlightMatch(article.title),
                  }}
                />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          textAlign: "center",
          marginBottom: "1rem",
        }}
      >
        <h2
          style={{
            fontSize: "1.35rem",
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          Categorias
        </h2>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {categories.map((category) => (
          <Link
            key={category}
            to={`/categoria/${encodeURIComponent(category)}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: "120px",
              background: "#fff",
              border: "1px solid #e3d6cb",
              borderRadius: "16px",
              padding: "1.1rem 1rem",
              boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
              textDecoration: "none",
              color: "#71594e",
              transition:
                "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 10px 20px rgba(0,0,0,0.1)";
              e.currentTarget.style.borderColor = "#71594E";
              e.currentTarget.style.backgroundColor = "#71594E";
              e.currentTarget.style.color = "#f3e6df";
              const img = e.currentTarget.querySelector("img");
              if (img) {
                img.style.filter =
                  "brightness(0) saturate(100%) invert(95%) sepia(8%) saturate(387%) hue-rotate(340deg) brightness(95%) contrast(90%)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.08)";
              e.currentTarget.style.borderColor = "#e3d6cb";
              e.currentTarget.style.backgroundColor = "#fff";
              e.currentTarget.style.color = "#71594e";
              const img = e.currentTarget.querySelector("img");
              if (img) {
                img.style.filter = "none";
              }
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.65rem",
              }}
            >
              <img
                src={categoryIcons[category]}
                alt={category}
                style={{ width: "40px", height: "40px", objectFit: "contain" }}
              />
              <h3
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  textAlign: "left",
                  letterSpacing: "0.01em",
                }}
              >
                {category}
              </h3>
            </div>
          </Link>
        ))}
        {categories.length === 0 && (
          <p style={{ gridColumn: "1 / -1" }}>Nenhuma categoria encontrada.</p>
        )}
      </div>
    </section>
  );
}

export default Home;
