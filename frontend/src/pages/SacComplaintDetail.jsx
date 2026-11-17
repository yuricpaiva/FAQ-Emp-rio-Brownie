import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";
import { useAuth } from "../context/AuthContext";
import { formatSacDate, formatSacDateTime, sacHistoryLabels, sacStatusLabels } from "../utils/sac";

function DataItem({ label, children, wide = false }) { return <div className={`sac-detail__item ${wide ? "sac-detail__item--wide" : ""}`}><span>{label}</span><div>{children || "—"}</div></div>; }

export default function SacComplaintDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [options, setOptions] = useState({});
  const [capabilities, setCapabilities] = useState({});
  const [auditNavigation, setAuditNavigation] = useState(null);
  const [offenderStoreId, setOffenderStoreId] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(location.state?.message ? { variant: "success", text: location.state.message } : null);

  const load = useCallback(async () => {
    try {
      const [itemResponse, optionResponse, capabilityResponse] = await Promise.all([api.get(`/sac/complaints/${id}`), api.get("/sac/options"), api.get("/sac/capabilities")]);
      setItem(itemResponse.data); setOptions(optionResponse.data); setCapabilities(capabilityResponse.data); setOffenderStoreId(String(itemResponse.data.offenderStoreId || itemResponse.data.suggestedOriginStoreId || ""));
      if (capabilityResponse.data.canAudit && itemResponse.data.workflowStatus === "PENDENTE_AUDITORIA") {
        const queueResponse = await api.get(`/sac/complaints/${id}/audit-navigation`);
        setAuditNavigation(queueResponse.data);
      } else setAuditNavigation(null);
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar a reclamação." }); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (type) => {
    setSaving(true); setNotice(null);
    try {
      if (type === "audit") await api.post(`/sac/complaints/${id}/audit`, { offenderStoreId: Number(offenderStoreId), reason: auditNote });
      else await api.post(`/sac/complaints/${id}/return`, { reason: returnReason });
      const successText = type === "audit" ? "Auditoria concluída." : "Reclamação devolvida para correção.";
      setNotice({ variant: "success", text: successText });
      setAuditNote(""); setReturnReason("");
      if (auditNavigation?.next?.id && Number(auditNavigation.next.id) !== Number(id)) navigate(`/sac/reclamacoes/${auditNavigation.next.id}`, { replace: true });
      else await load();
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível concluir a ação." }); }
    finally { setSaving(false); }
  };

  if (!item) return <section className="sac-page">{notice ? <SystemNotification variant={notice.variant}>{notice.text}</SystemNotification> : <div className="sac-loading">Carregando reclamação...</div>}</section>;
  const canEdit = capabilities.canManage || capabilities.canAudit || (item.createdBy.id === user?.id && ["RASCUNHO", "DEVOLVIDA"].includes(item.workflowStatus));
  return <section className="sac-page sac-detail">
    <header className="sac-page__header"><div><div className="sac-detail__title-line"><h1>{item.customerName}</h1><span className={`sac-status sac-status--${item.workflowStatus.toLowerCase()}`}>{sacStatusLabels[item.workflowStatus]}</span></div><p>Ocorrência de {formatSacDate(item.occurrenceDate)} · cadastrada por {item.createdBy.name}</p></div><div className="sac-page__header-actions">{canEdit && <Link className="button" to={`/sac/reclamacoes/${id}/editar`}><Pencil size={17} />Editar</Link>}<Link className="button button--ghost" to="/sac/reclamacoes"><ArrowLeft size={17} />Voltar</Link></div></header>
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    {capabilities.canAudit && auditNavigation?.total > 0 && <nav className="sac-audit-navigation" aria-label="Navegação entre reclamações pendentes"><Link className={!auditNavigation.previous ? "is-disabled" : ""} aria-disabled={!auditNavigation.previous} to={auditNavigation.previous ? `/sac/reclamacoes/${auditNavigation.previous.id}` : "#"}><ChevronLeft size={18} /><span><small>Anterior pendente</small><strong>{auditNavigation.previous?.customerName || "Nenhuma"}</strong></span></Link><div><strong>{auditNavigation.position}</strong><span>de {auditNavigation.total} pendentes</span></div><Link className={!auditNavigation.next ? "is-disabled" : ""} aria-disabled={!auditNavigation.next} to={auditNavigation.next ? `/sac/reclamacoes/${auditNavigation.next.id}` : "#"}><span><small>Próxima pendente</small><strong>{auditNavigation.next?.customerName || "Nenhuma"}</strong></span><ChevronRight size={18} /></Link></nav>}
    <section className="sac-detail__section"><h2>Dados da ocorrência</h2><div className="sac-detail__grid"><DataItem label="Nome do cliente">{item.customerName}</DataItem><DataItem label="Data">{formatSacDate(item.occurrenceDate)}</DataItem><DataItem label="Tipo de problema">{item.problemType.label}</DataItem><DataItem label="Local">{item.location.label}</DataItem><DataItem label="Loja da compra">{item.purchaseStore.label}</DataItem><DataItem label="Loja origem sugerida">{item.suggestedOriginStore.label}</DataItem><DataItem label="Loja ofensora confirmada">{item.offenderStore?.label}</DataItem><DataItem label="Status da ocorrência">{item.occurrenceStatus.label}</DataItem><DataItem label="Tipo de reclamação">{item.complaintType.label}</DataItem><DataItem label="Responsável pela tratativa">{item.treatmentOwner}</DataItem><DataItem label="Reclamação" wide>{item.complaintText}</DataItem><DataItem label="Ação realizada" wide>{item.actionTaken}</DataItem><DataItem label="Observação" wide>{item.observation}</DataItem><DataItem label="Resolução" wide>{item.resolution}</DataItem></div></section>
    {capabilities.canAudit && item.workflowStatus === "PENDENTE_AUDITORIA" && <section className="sac-audit"><div className="sac-audit__heading"><div><h2>Auditar reclamação</h2><p>Confirme a unidade ofensora ou devolva o registro com uma orientação clara.</p></div></div><div className="sac-audit__columns"><form onSubmit={(event) => { event.preventDefault(); act("audit"); }}><h3>Concluir auditoria</h3><label><span>Loja ofensora *</span><select value={offenderStoreId} onChange={(event) => setOffenderStoreId(event.target.value)} required><option value="">Selecione</option>{(options.STORE || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label><span>Nota da auditoria</span><textarea rows="3" value={auditNote} onChange={(event) => setAuditNote(event.target.value)} placeholder="Opcional" /></label><button className="button" disabled={saving}><CheckCircle2 size={17} />Confirmar ofensora</button></form><form onSubmit={(event) => { event.preventDefault(); act("return"); }}><h3>Devolver para correção</h3><label><span>Motivo da devolução *</span><textarea rows="5" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="Explique o que precisa ser corrigido." required /></label><button className="button button--ghost sac-return-button" disabled={saving}><RotateCcw size={17} />Devolver reclamação</button></form></div></section>}
    <section className="sac-detail__section"><h2>Histórico</h2><ol className="sac-timeline">{item.history.map((entry) => <li key={entry.id}><span className="sac-timeline__marker" /><div><strong>{sacHistoryLabels[entry.action] || entry.action}</strong><p>{entry.actor.name} · {formatSacDateTime(entry.createdAt)}</p>{entry.reason && <blockquote>{entry.reason}</blockquote>}{Object.keys(entry.changes || {}).length > 0 && entry.action === "EDITADA" && <small>{Object.keys(entry.changes).length} campo{Object.keys(entry.changes).length === 1 ? "" : "s"} alterado{Object.keys(entry.changes).length === 1 ? "" : "s"}</small>}</div></li>)}</ol></section>
  </section>;
}
