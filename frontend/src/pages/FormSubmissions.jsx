import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";
import { formatDateTime, formatScore, resultTypeLabels, statusLabels } from "../utils/forms";

function ColumnFilter({ label, active, children }) {
  return <div className="faq-table-heading"><span>{label}</span><details className={`faq-column-filter ${active ? "is-active" : ""}`}><summary aria-label={`Filtrar por ${label}`} title={`Filtrar por ${label}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></summary><div className="faq-column-filter__panel">{children}</div></details></div>;
}

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function FormSubmissions() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("mine");
  const [capabilities, setCapabilities] = useState({ canApprove: false });
  const [loadedItems, setItems] = useState([]);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [observerFilter, setObserverFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = tab === "approvals" ? "/forms/approvals" : "/forms/submissions";
      const response = await api.get(endpoint, { params: { scope: tab === "observing" ? "observing" : "mine", status: tab === "approvals" ? undefined : status || undefined, pageSize: 100 } });
      setItems(response.data.items);
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar os preenchimentos." }); }
    finally { setLoading(false); }
  }, [tab, status]);

  useEffect(() => { api.get("/forms/capabilities").then((response) => setCapabilities(response.data)); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === "approvals") setStatus(""); }, [tab]);
  useEffect(() => {
    if (!showNew) return undefined;
    api.get("/forms/available-models").then((response) => setModels(response.data)).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível listar os modelos." }));
    const escape = (event) => { if (event.key === "Escape" && !starting) setShowNew(false); };
    document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape);
  }, [showNew, starting]);

  const start = async (modelId) => {
    setStarting(modelId);
    try { const response = await api.post("/forms/submissions", { modelId }); setShowNew(false); navigate(`/forms/preenchimentos/${response.data.id}`); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível iniciar o preenchimento." }); }
    finally { setStarting(null); }
  };

  const items = loadedItems.filter((item) => {
    if (modelFilter && !item.model.name.toLocaleLowerCase("pt-BR").includes(modelFilter.toLocaleLowerCase("pt-BR"))) return false;
    if (tab !== "mine" && userFilter && !item.user.name.toLocaleLowerCase("pt-BR").includes(userFilter.toLocaleLowerCase("pt-BR"))) return false;
    if (tab === "mine" && observerFilter && !(item.observer?.name || "").toLocaleLowerCase("pt-BR").includes(observerFilter.toLocaleLowerCase("pt-BR"))) return false;
    if (dateFilter && localDateKey(item.startedAt) !== dateFilter) return false;
    if (scoreFilter !== "" && (item.finalScore === null || Number(item.finalScore) < Number(scoreFilter))) return false;
    return true;
  });

  const activeFilterCount = [modelFilter, tab !== "mine" ? userFilter : observerFilter, dateFilter, tab === "approvals" ? "" : status, scoreFilter].filter((value) => value !== "").length;
  const clearFilters = () => { setModelFilter(""); setUserFilter(""); setObserverFilter(""); setDateFilter(""); setStatus(""); setScoreFilter(""); };

  return <section className="page-stack forms-page"><header className="forms-hero"><div><p className="eyebrow">Formulários</p><h1>Preenchimentos</h1><p>Acompanhe seus formulários iniciados e concluídos.</p></div>{tab === "mine" && <button className="button" onClick={() => setShowNew(true)}>+ Novo preenchimento</button>}</header>{notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <div className="forms-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>Meus preenchimentos</button><button type="button" role="tab" aria-selected={tab === "observing"} className={tab === "observing" ? "active" : ""} onClick={() => setTab("observing")}>Observando</button>{capabilities.canApprove && <button type="button" role="tab" aria-selected={tab === "approvals"} className={tab === "approvals" ? "active" : ""} onClick={() => setTab("approvals")}>Aprovações</button>}</div>
    <details className="forms-mobile-filters">
      <summary><span>Filtros</span>{activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}</summary>
      <div className="forms-mobile-filters__body">
        <label><span>Formulário</span><input value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="Nome" /></label>
        {tab !== "mine" ? <label><span>Responsável</span><input value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="Nome" /></label> : <label><span>Observador</span><input value={observerFilter} onChange={(event) => setObserverFilter(event.target.value)} placeholder="Nome" /></label>}
        <label><span>Iniciado em</span><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
        {tab !== "approvals" && <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <label><span>Nota mínima</span><input type="number" step="any" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} placeholder="Mínima" /></label>
        {activeFilterCount > 0 && <button type="button" className="forms-mobile-filters__clear" onClick={clearFilters}>Limpar filtros</button>}
      </div>
    </details>
    <div key={tab} className="faq-table-wrap forms-responsive-table-wrap forms-submissions-transition"><table className="faq-table forms-submissions-table forms-responsive-table"><thead><tr><th><ColumnFilter label="Formulário" active={Boolean(modelFilter)}><input className="faq-table-filter" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="Nome" /></ColumnFilter></th>{tab !== "mine" && <th><ColumnFilter label="Responsável" active={Boolean(userFilter)}><input className="faq-table-filter" value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="Nome" /></ColumnFilter></th>}{tab === "mine" && <th><ColumnFilter label="Observador" active={Boolean(observerFilter)}><input className="faq-table-filter" value={observerFilter} onChange={(event) => setObserverFilter(event.target.value)} placeholder="Nome" /></ColumnFilter></th>}<th><ColumnFilter label="Iniciado em" active={Boolean(dateFilter)}><input className="faq-table-filter" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></ColumnFilter></th><th><ColumnFilter label="Status" active={Boolean(status)}><select className="faq-table-filter" value={status} onChange={(event) => setStatus(event.target.value)} disabled={tab === "approvals"}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></ColumnFilter></th><th><ColumnFilter label="Nota" active={scoreFilter !== ""}><input className="faq-table-filter" type="number" step="any" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} placeholder="Mínima" /></ColumnFilter></th><th className="faq-table-actions-heading">Ação</th></tr></thead><tbody>{loading && <tr><td colSpan="6" className="faq-table-empty">Carregando...</td></tr>}{!loading && items.map((item) => <tr key={item.id}><td data-label="Formulário" className="forms-responsive-table__title"><strong>{item.model.name}</strong><small>{item.model.description || "Formulário"}</small></td>{tab !== "mine" && <td data-label="Responsável">{item.user.name}</td>}{tab === "mine" && <td data-label="Observador">{item.observer?.name || "—"}</td>}<td data-label="Iniciado em">{formatDateTime(item.startedAt)}</td><td data-label="Status"><span className={`forms-status forms-status--${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></td><td data-label="Nota">{item.model.resultType === "SCORE" ? formatScore(item.finalScore) : "—"}</td><td data-label="Ação" className="forms-responsive-table__actions"><div className="faq-table-actions"><button type="button" onClick={() => navigate(`/forms/preenchimentos/${item.id}`)}>{item.status === "DRAFT" ? "Continuar" : tab === "approvals" ? "Analisar" : "Detalhes"}</button></div></td></tr>)}{!loading && !items.length && <tr><td colSpan="6" className="faq-table-empty">{tab === "approvals" ? "Nenhum preenchimento aguardando sua aprovação." : tab === "observing" ? "Nenhum preenchimento finalizado está sendo observado por você." : "Nenhum preenchimento encontrado."}</td></tr>}</tbody></table></div>
    {showNew && <div className="modal-backdrop" onClick={() => !starting && setShowNew(false)}><div className="modal-card modal-card--wide forms-new-modal" role="dialog" aria-modal="true" aria-labelledby="forms-new-title" onClick={(event) => event.stopPropagation()}><div className="modal-card__header"><div><h3 id="forms-new-title">Novo preenchimento</h3><p className="section-copy">Escolha um formulário disponível para você.</p></div><button type="button" onClick={() => setShowNew(false)} disabled={Boolean(starting)}>×</button></div><div className="forms-model-picker">{models.map((model) => <article key={model.id}><div><h4>{model.name}</h4><p>{model.description || "Sem descrição"}</p><span>{resultTypeLabels[model.resultType]}</span></div><button className="button" onClick={() => start(model.id)} disabled={Boolean(starting)}>{starting === model.id ? "Iniciando..." : "Iniciar"}</button></article>)}{!models.length && <div className="forms-empty">Não há modelos ativos disponíveis para o seu usuário.</div>}</div></div></div>}
  </section>;
}

export default FormSubmissions;
