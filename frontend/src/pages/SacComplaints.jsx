import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileWarning, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import { formatSacDate, sacStatusLabels } from "../utils/sac";
import { useAuth } from "../context/AuthContext";

const emptyFilters = () => ({ customerName: "", dateFrom: "", dateTo: "", problemTypeId: "", locationId: "", purchaseStoreId: "", suggestedOriginStoreId: "", offenderStoreId: "", occurrenceStatusId: "", complaintText: "", complaintTypeId: "", actionTaken: "", treatmentOwner: "", observation: "", resolution: "", workflowStatus: "" });

function FilterHeading({ label, active, children }) {
  return <div className="faq-table-heading"><span>{label}</span><details className={`faq-column-filter ${active ? "is-active" : ""}`}><summary aria-label={`Filtrar por ${label}`} title={`Filtrar por ${label}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg></summary><div className="faq-column-filter__panel">{children}</div></details></div>;
}

function OptionFilter({ value, onChange, options, allLabel = "Todos" }) {
  return <select className="faq-table-filter" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{(options || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>;
}

export default function SacComplaints() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm } = useSystemNotification();
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState({});
  const [capabilities, setCapabilities] = useState({});
  const [result, setResult] = useState({ items: [], page: 1, total: 0, totalPages: 1, pendingCount: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const query = useMemo(() => Object.fromEntries(Object.entries({ ...filters, page, pageSize: 50 }).filter(([, value]) => value !== "")), [filters, page]);
  const set = (field, value) => { setPage(1); setFilters((current) => ({ ...current, [field]: value })); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await api.get("/sac/complaints", { params: query }); setResult(response.data); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar as reclamações." }); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { Promise.all([api.get("/sac/options"), api.get("/sac/capabilities")]).then(([optionResponse, capabilityResponse]) => { setOptions(optionResponse.data); setCapabilities(capabilityResponse.data); }).catch(() => setNotice({ variant: "error", text: "Não foi possível carregar as configurações do SAC." })); }, []);
  useEffect(() => { const timer = window.setTimeout(load, 220); return () => window.clearTimeout(timer); }, [load]);

  const remove = async (item) => {
    const accepted = await confirm(`O rascunho de ${item.customerName} será excluído definitivamente.`, { title: "Excluir rascunho?", confirmLabel: "Excluir" });
    if (!accepted) return;
    try { await api.delete(`/sac/complaints/${item.id}`); setNotice({ variant: "success", text: "Rascunho excluído." }); load(); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível excluir o rascunho." }); }
  };
  const textFilter = (field, placeholder) => <div className="sac-filter-search"><Search size={14} /><input className="faq-table-filter" value={filters[field]} onChange={(event) => set(field, event.target.value)} placeholder={placeholder} /></div>;
  const canEdit = (item) => capabilities.canManage || capabilities.canAudit || (item.createdBy.id === user?.id && ["RASCUNHO", "DEVOLVIDA"].includes(item.workflowStatus));
  const canDelete = (item) => item.workflowStatus === "RASCUNHO" && (capabilities.canManage || item.createdBy.id === user?.id);
  const activeCount = Object.values(filters).filter(Boolean).length;

  return <section className="sac-page">
    <header className="sac-page__header"><div><h1>Reclamações</h1><p>Registre ocorrências, acompanhe tratativas e consulte a origem ofensora confirmada.</p></div><div className="sac-page__header-actions">{result.pendingCount > 0 && <button type="button" className="sac-pending-button" onClick={() => set("workflowStatus", "PENDENTE_AUDITORIA")}><FileWarning size={17} />{result.pendingCount} pendente{result.pendingCount === 1 ? "" : "s"}</button>}{capabilities.canCreate && <Link className="button" to="/sac/reclamacoes/nova"><Plus size={17} />Nova reclamação</Link>}</div></header>
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <details className="forms-mobile-filters sac-mobile-filters"><summary><span>Filtros</span>{activeCount > 0 && <strong>{activeCount}</strong>}</summary><div className="forms-mobile-filters__body"><label><span>Nome</span><input value={filters.customerName} onChange={(event) => set("customerName", event.target.value)} /></label><label><span>Data inicial</span><input type="date" value={filters.dateFrom} onChange={(event) => set("dateFrom", event.target.value)} /></label><label><span>Data final</span><input type="date" value={filters.dateTo} onChange={(event) => set("dateTo", event.target.value)} /></label><label><span>Status da auditoria</span><select value={filters.workflowStatus} onChange={(event) => set("workflowStatus", event.target.value)}><option value="">Todos</option>{Object.entries(sacStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="forms-mobile-filters__clear" onClick={() => { setFilters(emptyFilters()); setPage(1); }}>Limpar filtros</button></div></details>
    <div className="sac-list-meta"><span>{loading ? "Consultando..." : `${result.total} ${result.total === 1 ? "reclamação" : "reclamações"}`}</span>{activeCount > 0 && <button type="button" onClick={() => { setFilters(emptyFilters()); setPage(1); }}><RotateCcw size={14} />Limpar {activeCount} filtro{activeCount === 1 ? "" : "s"}</button>}</div>
    <div className="faq-table-wrap sac-table-wrap"><table className="faq-table forms-responsive-table sac-table"><thead><tr>
      <th><FilterHeading label="Cliente" active={Boolean(filters.customerName)}>{textFilter("customerName", "Nome do cliente")}</FilterHeading></th>
      <th><FilterHeading label="Data" active={Boolean(filters.dateFrom || filters.dateTo)}><div className="sac-date-filter"><label>De<input type="date" value={filters.dateFrom} onChange={(event) => set("dateFrom", event.target.value)} /></label><label>Até<input type="date" value={filters.dateTo} onChange={(event) => set("dateTo", event.target.value)} /></label></div></FilterHeading></th>
      <th><FilterHeading label="Classificação" active={Boolean(filters.problemTypeId || filters.complaintTypeId || filters.locationId)}><div className="sac-combined-filter"><OptionFilter value={filters.problemTypeId} onChange={(value) => set("problemTypeId", value)} options={options.PROBLEM_TYPE} allLabel="Todos os problemas" /><OptionFilter value={filters.complaintTypeId} onChange={(value) => set("complaintTypeId", value)} options={options.COMPLAINT_TYPE} allLabel="Todas as reclamações" /><OptionFilter value={filters.locationId} onChange={(value) => set("locationId", value)} options={options.LOCATION} allLabel="Todos os locais" /></div></FilterHeading></th>
      <th><FilterHeading label="Lojas" active={Boolean(filters.purchaseStoreId || filters.suggestedOriginStoreId || filters.offenderStoreId)}><div className="sac-combined-filter"><OptionFilter value={filters.purchaseStoreId} onChange={(value) => set("purchaseStoreId", value)} options={options.STORE} allLabel="Todas as lojas de compra" /><OptionFilter value={filters.suggestedOriginStoreId} onChange={(value) => set("suggestedOriginStoreId", value)} options={options.STORE} allLabel="Todas as origens sugeridas" /><OptionFilter value={filters.offenderStoreId} onChange={(value) => set("offenderStoreId", value)} options={options.STORE} allLabel="Todas as ofensoras" /></div></FilterHeading></th>
      <th><FilterHeading label="Reclamação" active={Boolean(filters.complaintText)}>{textFilter("complaintText", "Buscar no relato")}</FilterHeading></th>
      <th><FilterHeading label="Ocorrência" active={Boolean(filters.occurrenceStatusId)}><OptionFilter value={filters.occurrenceStatusId} onChange={(value) => set("occurrenceStatusId", value)} options={options.OCCURRENCE_STATUS} /></FilterHeading></th>
      <th><FilterHeading label="Tratativa" active={Boolean(filters.treatmentOwner || filters.actionTaken)}><div className="sac-combined-filter">{textFilter("treatmentOwner", "Responsável")}{textFilter("actionTaken", "Ação realizada")}</div></FilterHeading></th>
      <th><FilterHeading label="Auditoria" active={Boolean(filters.workflowStatus)}><select className="faq-table-filter" value={filters.workflowStatus} onChange={(event) => set("workflowStatus", event.target.value)}><option value="">Todos</option>{Object.entries(sacStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FilterHeading></th><th className="faq-table-actions-heading">Ações</th>
    </tr></thead><tbody>{loading ? <tr><td className="faq-table-empty" colSpan="9">Carregando reclamações...</td></tr> : result.items.length === 0 ? <tr><td className="faq-table-empty" colSpan="9">{activeCount ? "Nenhuma reclamação corresponde aos filtros." : "Nenhuma reclamação cadastrada."}</td></tr> : result.items.map((item) => <tr key={item.id}>
      <td data-label="Cliente" className="forms-responsive-table__title"><strong>{item.customerName}</strong></td><td data-label="Data">{formatSacDate(item.occurrenceDate)}</td><td data-label="Classificação"><strong>{item.complaintType.label}</strong></td><td data-label="Lojas"><strong>{item.offenderStore?.label || item.suggestedOriginStore.label}</strong></td><td data-label="Reclamação"><span className="sac-cell-text">{item.complaintText}</span></td><td data-label="Ocorrência"><span className="sac-occurrence-status">{item.occurrenceStatus.label}</span></td><td data-label="Tratativa"><strong>{item.treatmentOwner}</strong></td><td data-label="Auditoria"><span className={`sac-status sac-status--${item.workflowStatus.toLowerCase()}`}>{sacStatusLabels[item.workflowStatus]}</span></td><td data-label="Ações" className="forms-responsive-table__actions"><div className="faq-table-actions"><button type="button" onClick={() => navigate(`/sac/reclamacoes/${item.id}`)}><Eye size={14} />Ver</button>{canEdit(item) && <button type="button" onClick={() => navigate(`/sac/reclamacoes/${item.id}/editar`)}><Pencil size={14} />Editar</button>}{canDelete(item) && <button type="button" className="forms-delete-draft" onClick={() => remove(item)}><Trash2 size={14} />Excluir</button>}</div></td>
    </tr>)}</tbody></table></div>
    {result.totalPages > 1 && <nav className="sac-pagination" aria-label="Paginação"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {result.totalPages}</span><button type="button" disabled={page >= result.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></nav>}
  </section>;
}
