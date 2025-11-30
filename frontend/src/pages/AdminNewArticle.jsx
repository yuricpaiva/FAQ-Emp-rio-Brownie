import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import ReactQuill, { Quill } from "react-quill";
import ImageResize from "quill-image-resize-module-react";
import "react-quill/dist/quill.snow.css";

Quill.register("modules/imageResize", ImageResize);

function AdminNewArticle() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const categories = [
    "Operação",
    "Gente & Gestão",
    "TI",
    "Controladoria & Financeiro",
    "Comercial",
    "Marketing",
  ];
  const [category, setCategory] = useState(categories[0]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const quillRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/admin/articles", { title, slug, category, content });
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar artigo");
    } finally {
      setLoading(false);
    }
  };

  const autoSlug = (text) => {
    const newSlug = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    setSlug(newSlug);
  };

  const handleImageUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const url = res.data.url;
        const editor = quillRef.current?.getEditor();
        const range = editor.getSelection(true);
        editor.insertEmbed(range.index, "image", url);
        editor.setSelection(range.index + 1);
      } catch (err) {
        setError(err.response?.data?.error || "Erro ao enviar imagem");
      }
    };
    input.click();
  };

  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: handleImageUpload,
        },
      },
      imageResize: {
        modules: ["Resize", "DisplaySize"],
      },
    }),
    []
  );

  return (
    <section
      style={{
        maxWidth: "880px",
        margin: "0 auto",
        background: "#fff",
        border: "1px solid #e3d6cb",
        borderRadius: "16px",
        padding: "1.5rem",
        boxShadow: "0 18px 40px rgba(0,0,0,0.1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          gap: "1rem",
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#71594E", fontWeight: 800, letterSpacing: "0.02em" }}>
            Criar novo artigo
          </p>
          <p style={{ margin: 0, color: "#8b7468", fontSize: "0.95rem" }}>
            Preencha os campos abaixo para publicar no FAQ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/admin/dashboard")}
          style={{
            padding: "0.65rem 1rem",
            borderRadius: "12px",
            border: "1px solid #d7c7bc",
            background: "#fdfaf7",
            color: "#71594E",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.85rem" }}>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <label style={{ fontWeight: 700, color: "#71594E" }}>Titulo</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              autoSlug(e.target.value);
            }}
            required
            placeholder="Ex: Como acessar o dashboard"
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              fontSize: "1rem",
              outline: "none",
              background: "#fdfaf7",
              color: "#71594E",
            }}
          />
        </div>

        <div style={{ display: "grid", gap: "0.4rem" }}>
          <label style={{ fontWeight: 700, color: "#71594E" }}>Slug gerado</label>
          <div
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: "12px",
              border: "1px dashed #d7c7bc",
              fontSize: "1rem",
              background: "#fdfaf7",
              color: "#71594E",
            }}
          >
            {slug || "Digite o titulo para gerar automaticamente"}
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.4rem" }}>
          <label style={{ fontWeight: 700, color: "#71594E" }}>Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              fontSize: "1rem",
              outline: "none",
              background: "#fdfaf7",
              color: "#71594E",
              appearance: "none",
              WebkitAppearance: "none",
              MozAppearance: "none",
            }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: "0.4rem" }}>
          <label style={{ fontWeight: 700, color: "#71594E" }}>Conteudo</label>
          <div
            style={{
              background: "#fdfaf7",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              overflow: "hidden",
            }}
          >
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={content}
              onChange={setContent}
              modules={quillModules}
              placeholder="Descreva o passo a passo, links e detalhes uteis..."
            />
          </div>
        </div>

        {error && (
          <p style={{ color: "#c0392b", fontSize: "0.95rem", margin: 0 }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            style={{
              padding: "0.85rem 1.2rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              background: "#fdfaf7",
              color: "#71594E",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.85rem 1.4rem",
              borderRadius: "12px",
              border: "none",
              background: loading ? "#8b7468" : "#71594E",
              color: "#f3e6df",
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
              opacity: loading ? 0.8 : 1,
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {loading ? "Salvando..." : "Publicar"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminNewArticle;
