import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import FormCameraCapture from "../components/forms/FormCameraCapture";
import { formatDateTime, formatScore, photoUrl, statusLabels } from "../utils/forms";

function answerValue(answer) {
  if (answer.type === "TEXT") return answer.textValue ?? "";
  if (answer.type === "NUMBER") return answer.numberValue ?? "";
  if (answer.type === "BOOLEAN") return answer.booleanValue;
  if (answer.type === "SCORE") return answer.scoreValue ?? "";
  return null;
}

function AnswerInput({ answer, value, model, disabled, onChange, onPhoto }) {
  return <div className="forms-answer-control">
    {answer.type === "TEXT" && <textarea rows={5} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Digite sua resposta" />}
    {answer.type === "NUMBER" && <input type="number" step="any" inputMode="decimal" value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}
    {answer.type === "BOOLEAN" && <div className="forms-choice-group"><button type="button" disabled={disabled} className={value === true ? "selected" : ""} onClick={() => onChange(true)}>Sim</button><button type="button" disabled={disabled} className={value === false ? "selected" : ""} onClick={() => onChange(false)}>Não</button></div>}
    {answer.type === "SCORE" && <label className="forms-score-answer"><input type="number" inputMode="decimal" step="any" min={model.scoreMin} max={model.scoreMax} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} /><span>Use uma nota entre {model.scoreMin} e {model.scoreMax}</span></label>}
    {(answer.type === "PHOTO" || answer.photoRequired || answer.photo) && <div className="forms-evidence"><strong>Evidência {answer.photoRequired && "obrigatória"}</strong>{disabled ? answer.photo ? <img className="forms-photo-preview" src={photoUrl(answer.photo.id)} alt={`Evidência de ${answer.text}`} /> : <span className="forms-muted">Sem foto</span> : <FormCameraCapture submissionId={model.submissionId} answer={answer} onSaved={onPhoto} />}</div>}
  </div>;
}

function ObserverControl({ submission, candidates, search, saving, onSearch, onChange }) {
  const canManage = submission.permissions?.canManageObserver;
  return <details className={`forms-observer-menu ${submission.observer ? "has-observer" : ""}`}>
    <summary aria-label="Observador do preenchimento" title="Observador do preenchimento">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-4 2.8-6 7-6s6.5 2 7 6" /></svg>
      {submission.observer && <span aria-hidden="true" />}
    </summary>
    <div className="forms-observer-menu__panel">
      <strong>Observador</strong>
      {canManage ? <><p>{submission.status === "DRAFT" ? "O observador terá acesso somente após a finalização." : "O observador terá acesso de leitura imediatamente."}</p><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar usuário" aria-label="Buscar observador" /><select value={submission.observer?.id || ""} onChange={(event) => onChange(event.target.value)} disabled={saving} aria-label="Selecionar observador"><option value="">Sem observador</option>{submission.observer && !candidates.some((candidate) => candidate.id === submission.observer.id) && <option value={submission.observer.id}>{submission.observer.name}</option>}{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>{saving && <small>Salvando...</small>}</> : <><p>{submission.observerLocked ? "Definido pelo modelo e bloqueado neste preenchimento." : "Acesso somente de leitura."}</p><span className="forms-observer-menu__name">{submission.observer?.name || "Sem observador"}</span></>}
    </div>
  </details>;
}

function FormSubmission() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirm } = useSystemNotification();
  const [submission, setSubmission] = useState(null);
  const [values, setValues] = useState({});
  const [current, setCurrent] = useState(0);
  const [questionDirection, setQuestionDirection] = useState("next");
  const [saving, setSaving] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [observerCandidates, setObserverCandidates] = useState([]);
  const [observerSearch, setObserverSearch] = useState("");
  const [observerSaving, setObserverSaving] = useState(false);
  const timers = useRef(new Map());
  const pending = useRef(new Map());
  const dirty = useRef(new Set());
  const valuesRef = useRef({});

  const load = async () => {
    try {
      const response = await api.get(`/forms/submissions/${id}`);
      const next = Object.fromEntries(response.data.answers.map((answer) => [answer.id, answerValue(answer)]));
      setSubmission({ ...response.data, model: { ...response.data.model, submissionId: response.data.id } }); setValues(next); valuesRef.current = next;
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar o preenchimento." }); }
  };

  useEffect(() => { load(); return () => timers.current.forEach(clearTimeout); }, [id]);
  useEffect(() => {
    if (!submission?.permissions?.canManageObserver) return undefined;
    const timer = setTimeout(() => api.get("/forms/observer-candidates", { params: { search: observerSearch || undefined } }).then((response) => setObserverCandidates(response.data)).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível buscar observadores." })), 250);
    return () => clearTimeout(timer);
  }, [submission?.permissions?.canManageObserver, observerSearch]);
  useEffect(() => { const warn = (event) => { if (dirty.current.size) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, []);
  useEffect(() => { if (!rejectOpen) return undefined; const escape = (event) => { if (event.key === "Escape") setRejectOpen(false); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [rejectOpen]);

  const saveAnswer = (answerId) => {
    const timer = timers.current.get(answerId); if (timer) clearTimeout(timer); timers.current.delete(answerId);
    const value = valuesRef.current[answerId]; const previous = pending.current.get(answerId) || Promise.resolve();
    const request = previous.catch(() => {}).then(() => { setSaving((count) => count + 1); return api.patch(`/forms/submissions/${id}/answers/${answerId}`, { value }); }).then(() => { if (valuesRef.current[answerId] === value) dirty.current.delete(answerId); setNotice(null); }).catch((error) => { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar a resposta." }); throw error; }).finally(() => { setSaving((count) => Math.max(0, count - 1)); if (pending.current.get(answerId) === request) pending.current.delete(answerId); });
    pending.current.set(answerId, request); return request;
  };
  const change = (answerId, value) => { const next = { ...valuesRef.current, [answerId]: value }; valuesRef.current = next; setValues(next); dirty.current.add(answerId); const old = timers.current.get(answerId); if (old) clearTimeout(old); timers.current.set(answerId, setTimeout(() => saveAnswer(answerId).catch(() => {}), 550)); };
  const flush = async () => { await Promise.all([...dirty.current].map(saveAnswer)); await Promise.all([...pending.current.values()]); };
  const go = async (direction) => { try { await flush(); setQuestionDirection(direction < 0 ? "previous" : "next"); setCurrent((index) => Math.max(0, Math.min(submission.answers.length - 1, index + direction))); } catch { /* mensagem já exibida */ } };
  const finalize = async () => { if (!await confirm("Depois de finalizado, este preenchimento não poderá ser alterado.", { title: "Finalizar preenchimento?", confirmLabel: "Finalizar" })) return; setFinalizing(true); try { await flush(); await api.post(`/forms/submissions/${id}/finalize`); dirty.current.clear(); navigate("/forms/preenchimentos", { replace: true }); } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível finalizar." }); } finally { setFinalizing(false); } };
  const decide = async (decision, reason = "") => { if (decision === "reject" && !reason.trim()) { setNotice({ variant: "error", text: "A justificativa é obrigatória." }); return; } if (!await confirm(decision === "approve" ? "O preenchimento será aprovado." : "O preenchimento será reprovado.", { title: decision === "approve" ? "Aprovar preenchimento?" : "Reprovar preenchimento?", confirmLabel: decision === "approve" ? "Aprovar" : "Reprovar" })) return; try { const response = await api.post(`/forms/submissions/${id}/${decision}`, { reason }); setSubmission({ ...response.data, permissions: { canEdit: false, canApprove: false }, model: { ...response.data.model, submissionId: response.data.id } }); setRejectOpen(false); setRejectionReason(""); setNotice({ variant: "success", text: decision === "approve" ? "Preenchimento aprovado." : "Preenchimento reprovado." }); } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível concluir a análise." }); } };
  const changeObserver = async (observerId) => {
    setObserverSaving(true);
    try {
      const response = await api.patch(`/forms/submissions/${id}/observer`, { observerId: observerId ? Number(observerId) : null });
      setSubmission((currentSubmission) => ({ ...currentSubmission, observer: response.data.observer, observerLocked: response.data.observerLocked }));
      setNotice({ variant: "success", text: response.data.observer ? "Observador salvo." : "Observador removido." });
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível alterar o observador." }); }
    finally { setObserverSaving(false); }
  };

  if (!submission) return <section className="page-stack">{notice ? <SystemNotification variant="error">{notice.text}</SystemNotification> : <div className="forms-empty">Carregando preenchimento...</div>}<button className="button button--ghost" onClick={() => navigate("/forms/preenchimentos")}>Voltar</button></section>;
  const editable = submission.permissions?.canEdit;
  const answer = submission.answers[current];
  return <section className="page-stack forms-page forms-execution"><header className="forms-execution-header"><div><button className="forms-back" onClick={() => navigate("/forms/preenchimentos")}>← Voltar</button><p className="eyebrow">{editable ? "Preenchimento em andamento" : "Detalhes do preenchimento"}</p><h1>{submission.model.name}</h1><p>{submission.model.description}</p></div><div className="forms-execution-state"><div className="forms-execution-tools"><span className={`forms-status forms-status--${submission.status.toLowerCase()}`}>{statusLabels[submission.status]}</span><ObserverControl submission={submission} candidates={observerCandidates} search={observerSearch} saving={observerSaving} onSearch={setObserverSearch} onChange={changeObserver} /></div>{editable && <span>{saving ? "Salvando..." : "Alterações salvas"}</span>}</div></header>{notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    {editable ? <><div className="forms-progress"><div><span>Pergunta {current + 1} de {submission.answers.length}</span><strong>{Math.round(((current + 1) / submission.answers.length) * 100)}%</strong></div><progress value={current + 1} max={submission.answers.length} /></div><article key={answer.id} className={`forms-answer-card forms-question-transition forms-question-transition--${questionDirection}`}><header><span>{answer.position}</span><div><h2>{answer.text}</h2><p>{answer.required ? "Resposta obrigatória" : "Resposta opcional"}{answer.photoRequired ? " · Foto obrigatória" : ""}</p></div></header><AnswerInput answer={answer} value={values[answer.id]} model={submission.model} onChange={(value) => change(answer.id, value)} onPhoto={(photo) => setSubmission((currentSubmission) => ({ ...currentSubmission, answers: currentSubmission.answers.map((item) => item.id === answer.id ? { ...item, photo } : item) }))} /></article><div className="forms-execution-actions"><button className="button button--ghost" onClick={() => go(-1)} disabled={!current || saving}>Anterior</button>{current < submission.answers.length - 1 ? <button className="button" onClick={() => go(1)} disabled={saving}>Próxima</button> : <button className="button" onClick={finalize} disabled={saving || finalizing}>{finalizing ? "Finalizando..." : "Finalizar"}</button>}</div></> : <><div className="forms-summary"><span>Iniciado em <strong>{formatDateTime(submission.startedAt)}</strong></span>{submission.finalScore !== null && <span>Nota final <strong>{formatScore(submission.finalScore)}</strong></span>}{submission.approvedBy && <span>Aprovado por <strong>{submission.approvedBy.name}</strong></span>}{submission.rejectedBy && <span>Reprovado por <strong>{submission.rejectedBy.name}</strong>: {submission.rejectionReason}</span>}</div><div className="forms-readonly-answers">{submission.answers.map((item) => <article className="forms-answer-card" key={item.id}><header><span>{item.position}</span><div><h2>{item.text}</h2></div></header><AnswerInput answer={item} value={answerValue(item)} model={submission.model} disabled /></article>)}</div>{submission.permissions?.canApprove && <div className="forms-approval-actions"><button className="button button--ghost" onClick={() => setRejectOpen(true)}>Reprovar</button><button className="button" onClick={() => decide("approve")}>Aprovar</button></div>}</>}
    {rejectOpen && <div className="modal-backdrop" onClick={() => setRejectOpen(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="forms-reject-title" onClick={(event) => event.stopPropagation()}><div className="modal-card__header"><h3 id="forms-reject-title">Reprovar preenchimento</h3><button type="button" onClick={() => setRejectOpen(false)}>×</button></div><label className="forms-reject-field"><span>Justificativa</span><textarea rows={5} maxLength={1000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} autoFocus /></label><div className="form-actions"><button type="button" className="button button--ghost" onClick={() => setRejectOpen(false)}>Cancelar</button><button type="button" className="button" onClick={() => decide("reject", rejectionReason)}>Reprovar</button></div></div></div>}
  </section>;
}

export default FormSubmission;
