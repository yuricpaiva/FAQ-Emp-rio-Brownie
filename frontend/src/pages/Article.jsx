import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import api from "../services/api";
import { safeArticleHtml } from "../utils/articleVideo";

function slugifyHeading(value, index) {
  const slug = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || `secao-${index + 1}`;
}

function Article() {
  const { slug } = useParams();
  const contentRef = useRef(null);
  const [article, setArticle] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/knowledge/articles/${slug}`).then((res) => { setArticle(res.data); setNotFound(false); }).catch(() => { setArticle(null); setNotFound(true); });
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
      dateLabel: `Em ${updatedAt.toLocaleDateString("pt-BR")}`,
      initials: (article.updatedBy || article.author || "US").split(" ").filter(Boolean).map((part) => part[0]?.toUpperCase()).join("").slice(0, 2) || "US",
    };
  }, [article]);

  const content = useMemo(() => {
    const sanitized = safeArticleHtml(article?.content || "", DOMPurify);
    if (!sanitized || typeof window === "undefined") return { html: sanitized, headings: [] };
    const documentFragment = new DOMParser().parseFromString(sanitized, "text/html");
    const headings = [...documentFragment.body.querySelectorAll("h2, h3")].map((heading, index) => {
      const label = heading.textContent?.trim() || `Seção ${index + 1}`;
      const id = `${slugifyHeading(label, index)}-${index + 1}`;
      heading.id = id;
      return { id, label, level: heading.tagName.toLowerCase() };
    });
    documentFragment.body.querySelectorAll("img").forEach((image) => {
      image.loading = "lazy";
      image.decoding = "async";
      if (!image.getAttribute("alt")) image.setAttribute("alt", "Imagem de apoio deste procedimento");
    });
    return { html: documentFragment.body.innerHTML, headings };
  }, [article?.content]);

  useEffect(() => {
    const images = contentRef.current?.querySelectorAll("img") || [];
    const handleImageError = (event) => {
      const image = event.currentTarget;
      const fallback = document.createElement("span");
      fallback.className = "article-media-error";
      fallback.setAttribute("role", "status");
      fallback.textContent = "Imagem indisponível. Avise o responsável pelo conteúdo para que ela seja atualizada.";
      image.replaceWith(fallback);
    };
    images.forEach((image) => image.addEventListener("error", handleImageError, { once: true }));
    return () => images.forEach((image) => image.removeEventListener("error", handleImageError));
  }, [content.html]);

  if (notFound) {
    return <section className="empty-state empty-state--action"><h1>Artigo não encontrado</h1><p>Este conteúdo pode ter sido removido ou ter mudado de endereço.</p><Link className="button" to="/">Pesquisar outro artigo</Link></section>;
  }
  if (!article || !articleMeta) return <div className="surface-card" role="status">Carregando artigo...</div>;

  return (
    <article className="article-detail">
      <nav className="article-breadcrumb" aria-label="Caminho do artigo">
        <Link to="/">Início</Link><span aria-hidden="true">/</span><Link to={`/categoria/${article.categorySlug}`}>{article.category}</Link><span aria-hidden="true">/</span><span aria-current="page">{article.title}</span>
      </nav>
      <div className="article-detail__header">
        <div className="article-detail__badges"><span>{article.category}</span><span>{article.status === "draft" ? "Rascunho" : "Publicado"}</span></div>
        <h1>{article.title}</h1>
        {article.summary && <p className="article-detail__summary">{article.summary}</p>}
        <div className="article-detail__author">
          {articleMeta.photoUrl ? <img src={articleMeta.photoUrl} alt="" className="article-detail__author-avatar" /> : <div className="article-detail__author-avatar article-detail__author-avatar--fallback" aria-hidden="true">{articleMeta.initials}</div>}
          <div className="article-detail__author-copy"><span>{articleMeta.label}</span><strong>{articleMeta.name}</strong></div><span className="article-detail__author-date">{articleMeta.dateLabel}</span>
        </div>
      </div>

      <div className={`article-detail__body ${content.headings.length >= 3 ? "article-detail__body--with-toc" : ""}`}>
        {content.headings.length >= 3 && <aside className="article-toc"><strong>Neste artigo</strong><nav aria-label="Seções do artigo">{content.headings.map((heading) => <a key={heading.id} className={heading.level === "h3" ? "article-toc__nested" : ""} href={`#${heading.id}`}>{heading.label}</a>)}</nav></aside>}
        <div ref={contentRef} className="article-detail__content prose" dangerouslySetInnerHTML={{ __html: content.html }} />
      </div>
      <footer className="article-detail__footer"><Link className="button button--ghost" to={`/categoria/${article.categorySlug}`}>Voltar para {article.category}</Link></footer>
    </article>
  );
}

export default Article;
