import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import ArticleEmojiPicker from "../components/ArticleEmojiPicker";
import ReactQuill, { Quill } from "react-quill";
import ImageResize from "quill-image-resize-module-react";
import "react-quill/dist/quill.snow.css";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";

Quill.register("modules/imageResize", ImageResize);

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function AdminNewArticle() {
  const { confirm } = useSystemNotification();
  const navigate = useNavigate();
  const quillRef = useRef(null);
  const wordInputRef = useRef(null);
  const selectionRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState("");
  const [importWarnings, setImportWarnings] = useState([]);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  useEffect(() => {
    api
      .get("/knowledge/categories")
      .then((res) => {
        setCategories(res.data);
        setCategory(res.data[0]?.name || "");
      })
      .catch(() => setCategories([]));
  }, []);

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

  const handleEmojiSelect = (emoji) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const range = editor.getSelection() || selectionRef.current;
    const index = range?.index ?? Math.max(editor.getLength() - 1, 0);

    editor.insertText(index, emoji, "user");
    editor.setSelection(index + emoji.length, 0, "user");
    editor.focus();
  };

  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image", "emoji"],
          ["clean"],
        ],
        handlers: {
          image: handleImageUpload,
          emoji: () => setEmojiPickerOpen((current) => !current),
        },
      },
      imageResize: { modules: ["Resize", "DisplaySize"] },
    }),
    []
  );

  const handleWordImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if ((title.trim() || content.trim()) && !(await confirm("O arquivo importado substituirá o conteúdo atual.", {
      title: "Substituir conteúdo?",
      confirmLabel: "Importar arquivo",
    }))) {
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
      await api.post("/admin/articles", {
        title,
        slug: slugify(title),
        summary,
        category,
        content,
        status,
        sortOrder: 0,
      });
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Erro ao criar artigo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card surface-card--editor">
      <div className="section-heading section-heading--split">
        <div>
          <p className="eyebrow">Publicação</p>
          <h1>Novo artigo</h1>
          <p className="section-copy">Preencha as informações essenciais e publique o conteúdo.</p>
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

      {importWarnings.length > 0 && (
        <SystemNotification variant="warning" title="Importação concluída com observações">
          Revise a formatação antes de publicar.
        </SystemNotification>
      )}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          <span>Título</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
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

        <label className="form-grid__full">
          <span>Conteúdo</span>
          <div className="editor-wrap">
            <div className="editor-shell">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={content}
                onChange={setContent}
                onChangeSelection={(range) => {
                  if (range) selectionRef.current = range;
                }}
                modules={quillModules}
                placeholder="Descreva o passo a passo, links e detalhes uteis..."
              />
            </div>
            <ArticleEmojiPicker
              open={emojiPickerOpen}
              onClose={() => setEmojiPickerOpen(false)}
              onSelect={handleEmojiSelect}
            />
          </div>
        </label>

        {error && <SystemNotification variant="error">{error}</SystemNotification>}

        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={() => navigate("/admin/dashboard")}>
            Cancelar
          </button>
          <button type="submit" className="button" disabled={loading}>
            {loading ? "Salvando..." : "Publicar"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AdminNewArticle;
