import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import { modelPayload, resultTypeLabels } from "../utils/forms";

function ColumnFilter({ label, active, children }) {
  return <div className="faq-table-heading"><span>{label}</span><details className={`faq-column-filter ${active ? "is-active" : ""}`}><summary aria-label={`Filtrar por ${label}`} title={`Filtrar por ${label}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></summary><div className="faq-column-filter__panel">{children}</div></details></div>;
}

function FormsModels() {
  const navigate = useNavigate();
  const { confirm } = useSystemNotification();
  const [loadedModels, setModels] = useState([]);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [questionsFilter, setQuestionsFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState("");
  const [observerFilter, setObserverFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/forms/models", { params: { search: search || undefined, active: active || undefined, pageSize: 100 } });
      setModels(response.data.items);
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar os modelos." }); }
    finally { setLoading(false); }
  }, [search, active]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const toggle = async (model) => {
    const action = model.active ? "inativar" : "ativar";
    if (!await confirm(`Deseja ${action} o modelo ${model.name}?`, { title: `${model.active ? "Inativar" : "Ativar"} modelo`, confirmLabel: model.active ? "Inativar" : "Ativar" })) return;
    try {
      await api.put(`/forms/models/${model.id}`, { ...modelPayload(model), active: !model.active });
      setNotice({ variant: "success", text: `Modelo ${model.active ? "inativado" : "ativado"}.` });
      load();
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível alterar o modelo." }); }
  };

  const models = loadedModels.filter((model) => {
    if (typeFilter && model.resultType !== typeFilter) return false;
    if (questionsFilter !== "" && model.questions.length !== Number(questionsFilter)) return false;
    if (flowFilter === "approval" && !model.requiresApproval) return false;
    if (flowFilter === "direct" && model.requiresApproval) return false;
    if (observerFilter && !(model.defaultObserver?.name || "").toLocaleLowerCase("pt-BR").includes(observerFilter.toLocaleLowerCase("pt-BR"))) return false;
    return true;
  });

  const activeFilterCount = [search, active, typeFilter, questionsFilter, flowFilter, observerFilter].filter((value) => value !== "").length;
  const clearFilters = () => { setSearch(""); setActive(""); setTypeFilter(""); setQuestionsFilter(""); setFlowFilter(""); setObserverFilter(""); };

  return <section className="page-stack forms-page">
    <header className="forms-hero"><div><p className="eyebrow">Formulários</p><h1>Modelos</h1><p>Crie formulários reutilizáveis, permissões e fluxos de aprovação.</p></div><button className="button" onClick={() => navigate("/forms/modelos/novo")}>+ Novo modelo</button></header>
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <details className="forms-mobile-filters">
      <summary><span>Filtros</span>{activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}</summary>
      <div className="forms-mobile-filters__body">
        <label><span>Modelo</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome" /></label>
        <label><span>Tipo</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option><option value="SIMPLE">Simples</option><option value="SCORE">Pontuação</option></select></label>
        <label><span>Perguntas</span><input type="number" min="0" value={questionsFilter} onChange={(event) => setQuestionsFilter(event.target.value)} placeholder="Quantidade" /></label>
        <label><span>Fluxo</span><select value={flowFilter} onChange={(event) => setFlowFilter(event.target.value)}><option value="">Todos</option><option value="direct">Direto</option><option value="approval">Com aprovação</option></select></label>
        <label><span>Observador padrão</span><input value={observerFilter} onChange={(event) => setObserverFilter(event.target.value)} placeholder="Nome" /></label>
        <label><span>Status</span><select value={active} onChange={(event) => setActive(event.target.value)}><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>
        {activeFilterCount > 0 && <button type="button" className="forms-mobile-filters__clear" onClick={clearFilters}>Limpar filtros</button>}
      </div>
    </details>
    <div className="faq-table-wrap forms-responsive-table-wrap">
      <table className="faq-table forms-models-table forms-responsive-table">
        <thead><tr><th><ColumnFilter label="Modelo" active={Boolean(search)}><input className="faq-table-filter" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome" /></ColumnFilter></th><th><ColumnFilter label="Tipo" active={Boolean(typeFilter)}><select className="faq-table-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Todos</option><option value="SIMPLE">Simples</option><option value="SCORE">Pontuação</option></select></ColumnFilter></th><th><ColumnFilter label="Perguntas" active={questionsFilter !== ""}><input className="faq-table-filter" type="number" min="0" value={questionsFilter} onChange={(event) => setQuestionsFilter(event.target.value)} placeholder="Quantidade" /></ColumnFilter></th><th><ColumnFilter label="Fluxo" active={Boolean(flowFilter)}><select className="faq-table-filter" value={flowFilter} onChange={(event) => setFlowFilter(event.target.value)}><option value="">Todos</option><option value="direct">Direto</option><option value="approval">Com aprovação</option></select></ColumnFilter></th><th><ColumnFilter label="Observador padrão" active={Boolean(observerFilter)}><input className="faq-table-filter" value={observerFilter} onChange={(event) => setObserverFilter(event.target.value)} placeholder="Nome" /></ColumnFilter></th><th><ColumnFilter label="Status" active={Boolean(active)}><select className="faq-table-filter" value={active} onChange={(event) => setActive(event.target.value)}><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></ColumnFilter></th><th className="faq-table-actions-heading">Ações</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan="7" className="faq-table-empty">Carregando modelos...</td></tr>}
          {!loading && models.map((model) => <tr className={!model.active ? "is-inactive" : ""} key={model.id}><td data-label="Modelo" className="forms-responsive-table__title"><strong>{model.name}</strong><small>{model.description || "Sem descrição"}</small></td><td data-label="Tipo">{resultTypeLabels[model.resultType]}</td><td data-label="Perguntas">{model.questions.length}</td><td data-label="Fluxo">{model.requiresApproval ? "Com aprovação" : "Direto"}</td><td data-label="Observador padrão">{model.defaultObserver?.name || "—"}</td><td data-label="Status"><span className={`forms-status forms-status--${model.active ? "active" : "inactive"}`}>{model.active ? "Ativo" : "Inativo"}</span></td><td data-label="Ações" className="forms-responsive-table__actions"><div className="faq-table-actions"><button type="button" onClick={() => navigate(`/forms/modelos/${model.id}/editar`)}>Editar</button><button type="button" onClick={() => toggle(model)}>{model.active ? "Inativar" : "Ativar"}</button></div></td></tr>)}
          {!loading && !models.length && <tr><td colSpan="7" className="faq-table-empty">Nenhum modelo encontrado.</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

export default FormsModels;
