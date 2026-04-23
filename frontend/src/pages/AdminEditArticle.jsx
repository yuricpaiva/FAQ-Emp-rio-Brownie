import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import ReactQuill, { Quill } from "react-quill";
import ImageResize from "quill-image-resize-module-react";
import "react-quill/dist/quill.snow.css";

Quill.register("modules/imageResize", ImageResize);

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function AdminEditArticle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const quillRef = useRef(null);
  const wordInputRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState("");
  const [importWarnings, setImportWarnings] = useState([]);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get("/knowledge/categories")
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    Promise.all([api.get(`/knowledge/articles/id/${id}`), api.get(`/admin/articles/${id}/revisions`)])
      .then(([articleRes, revisionsRes]) => {
        const article = articleRes.data;
        setTitle(article.title);
        setSlug(article.slug);
        setSummary(article.summary || "");
        setCategory(article.category);
        setContent(article.content);
        setStatus(article.status);
        setSortOrder(article.sortOrder);
        setRevisions(revisionsRes.data);
        setLoaded(true);
      })
      .catch(() => setError("Não foi possível carregar o artigo."));
  }, [id]);

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
        const editor = quillRef.current?.getEditor();
        const range = editor.getSelection(true);
        editor.insertEmbed(range.index, "image", res.data.url);
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
        handlers: { image: handleImageUpload },
      },
      imageResize: { modules: ["Resize", "DisplaySize"] },
    }),
    []
  );

  const handleWordImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (content.trim() && !window.confirm("Importar o arquivo vai substituir o conteudo atual. Deseja continuar?")) {
      return;
    }

    setImporting(true);
    setError("");
    setImportWarnings([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/admin/articles/import-word", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setTitle(res.data.title || "");
      setSlug(slugify(res.data.title || ""));
      setContent(res.data.content || "");
      setImportWarnings(res.data.warnings || []);
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao importar documento Word");
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.put(`/admin/articles/${id}`, {
        title,
        slug,
        summary,
        category,
        content,
        status,
        sortOrder: Number(sortOrder),
      });
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao atualizar artigo");
    } finally {
      setLoading(false);
    }
  };

  if (!loaded && !error) {
    return <div className="surface-card">Carregando artigo...</div>;
  }

  return (
    <section className="page-stack">
      <section className="surface-card surface-card--editor">
        <div className="section-heading section-heading--split">
          <div>
            <p className="eyebrow">Edição</p>
            <h1>Editar artigo</h1>
            <p className="section-copy">Ajuste o conteúdo e acompanhe o histórico recente.</p>
          </div>
          <div className="toolbar">
            <input
              ref={wordInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="visually-hidden"
              onChange={handleWordImport}
            />
            <button
              type="button"
              className="button button--ghost"
              onClick={() => wordInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? "Importando Word..." : "Importar Word"}
            </button>
            <button type="button" className="button button--ghost" onClick={() => navigate("/admin/dashboard")}>
              Voltar
            </button>
          </div>
        </div>

        {error && <p className="form-message form-message--error">{error}</p>}
        {importWarnings.length > 0 && (
          <div className="import-note">
          <strong>Importação concluída com observações.</strong>
          <p>Revise a formatação antes de salvar.</p>
          </div>
        )}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            <span>Título</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSlug(slugify(event.target.value));
              }}
              required
            />
          </label>
          <label>
            <span>Slug</span>
            <input value={slug} onChange={(event) => setSlug(event.target.value)} required />
          </label>
          <label className="form-grid__full">
            <span>Resumo</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
          </label>
          <label>
            <span>Categoria</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} required>
              {categories.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
            </select>
          </label>
          <label>
            <span>Ordem</span>
            <input
              type="number"
              min="0"
              max="9999"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </label>
          <label className="form-grid__full">
            <span>Conteúdo</span>
            <div className="editor-shell">
              <ReactQuill ref={quillRef} theme="snow" value={content} onChange={setContent} modules={quillModules} />
            </div>
          </label>

          <div className="form-actions">
            <button type="button" className="button button--ghost" onClick={() => navigate("/admin/dashboard")}>
              Cancelar
            </button>
            <button type="submit" className="button" disabled={loading}>
              {loading ? "Salvando..." : "Atualizar"}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Historico</p>
            <h2>Últimas revisões</h2>
          </div>
        </div>
        <div className="revision-list">
          {revisions.map((revision) => (
            <div key={revision.id} className="revision-list__item">
              <strong>{revision.title}</strong>
              <p>{revision.summary || "Sem resumo nesta revisão."}</p>
              <small>
                {revision.status === "draft" ? "Rascunho" : "Publicado"} • {revision.updatedBy} •{" "}
                {new Date(revision.createdAt).toLocaleString("pt-BR")}
              </small>
            </div>
          ))}
          {!revisions.length && <p className="empty-state">Nenhuma revisão registrada.</p>}
        </div>
      </section>
    </section>
  );
}

export default AdminEditArticle;
