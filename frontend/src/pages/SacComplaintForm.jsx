import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Send } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const initialForm = () => ({ customerName: "", occurrenceDate: todayKey(), problemTypeId: "", locationId: "", purchaseStoreId: "", suggestedOriginStoreId: "", occurrenceStatusId: "", complaintText: "", complaintTypeId: "", actionTaken: "", treatmentOwner: "", observation: "", resolution: "" });

function SelectField({ label, value, options, onChange, required = true }) {
  return <label><span>{label}{required && " *"}</span><select value={value} onChange={(event) => onChange(event.target.value)} required={required}><option value="">Selecione</option>{(options || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

export default function SacComplaintForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [options, setOptions] = useState({});
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    const requests = [api.get("/sac/options")];
    if (id) requests.push(api.get(`/sac/complaints/${id}`));
    Promise.all(requests).then(([optionResponse, complaintResponse]) => {
      setOptions(optionResponse.data);
      if (complaintResponse) {
        const item = complaintResponse.data;
        setExisting(item);
        setForm(Object.fromEntries(Object.keys(initialForm()).map((field) => [field, field.endsWith("Id") ? String(item[field] || "") : item[field] || ""])));
      }
    }).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar o formulário." })).finally(() => setLoading(false));
  }, [id]);

  const payload = useMemo(() => ({ ...form, problemTypeId: Number(form.problemTypeId), locationId: Number(form.locationId), purchaseStoreId: Number(form.purchaseStoreId), suggestedOriginStoreId: Number(form.suggestedOriginStoreId), occurrenceStatusId: Number(form.occurrenceStatusId), complaintTypeId: Number(form.complaintTypeId) }), [form]);
  const canSubmit = !existing || ["RASCUNHO", "DEVOLVIDA"].includes(existing.workflowStatus);
  const save = async (submitAfter) => {
    setSaving(true); setNotice(null);
    try {
      const response = id ? await api.put(`/sac/complaints/${id}`, payload) : await api.post("/sac/complaints", payload);
      if (submitAfter) {
        await api.post(`/sac/complaints/${response.data.id}/submit`);
        navigate(`/sac/reclamacoes/${response.data.id}`, { replace: true, state: { message: "Reclamação enviada para auditoria." } });
      } else {
        setExisting(response.data);
        setNotice({ variant: "success", text: response.data.workflowStatus === "RASCUNHO" ? "Rascunho salvo com sucesso." : "Alterações salvas com sucesso." });
        if (!id) navigate(`/sac/reclamacoes/${response.data.id}/editar`, { replace: true });
      }
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar a reclamação." }); }
    finally { setSaving(false); }
  };
  const handleSubmit = (event, submitAfter = false) => { event.preventDefault(); save(submitAfter); };

  if (loading) return <div className="sac-loading">Carregando formulário...</div>;
  return <section className="sac-page sac-form-page">
    <header className="sac-page__header"><div><h1>{id ? "Editar reclamação" : "Nova reclamação"}</h1><p>Registre os dados da ocorrência conforme o atendimento realizado.</p></div><Link className="button button--ghost" to={id ? `/sac/reclamacoes/${id}` : "/sac/reclamacoes"}><ArrowLeft size={17} />Voltar</Link></header>
    {existing?.workflowStatus === "DEVOLVIDA" && <SystemNotification variant="error">Esta reclamação foi devolvida. Corrija os dados indicados no histórico e reenvie para auditoria.</SystemNotification>}
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <form className="sac-form" onSubmit={(event) => handleSubmit(event, false)}>
      <section className="sac-form__section"><h2>Identificação da ocorrência</h2><div className="sac-form__grid"><label><span>Nome do cliente *</span><input value={form.customerName} onChange={(event) => set("customerName", event.target.value)} maxLength="160" required /></label><label><span>Data da ocorrência *</span><input type="date" value={form.occurrenceDate} onChange={(event) => set("occurrenceDate", event.target.value)} required /></label><SelectField label="Tipo de problema" value={form.problemTypeId} options={options.PROBLEM_TYPE} onChange={(value) => set("problemTypeId", value)} /><SelectField label="Local" value={form.locationId} options={options.LOCATION} onChange={(value) => set("locationId", value)} /><SelectField label="Loja da compra" value={form.purchaseStoreId} options={options.STORE} onChange={(value) => set("purchaseStoreId", value)} /><SelectField label="Loja origem sugerida" value={form.suggestedOriginStoreId} options={options.STORE} onChange={(value) => set("suggestedOriginStoreId", value)} /><SelectField label="Status da ocorrência" value={form.occurrenceStatusId} options={options.OCCURRENCE_STATUS} onChange={(value) => set("occurrenceStatusId", value)} /><SelectField label="Tipo de reclamação" value={form.complaintTypeId} options={options.COMPLAINT_TYPE} onChange={(value) => set("complaintTypeId", value)} /></div></section>
      <section className="sac-form__section"><h2>Relato e tratativa</h2><div className="sac-form__grid sac-form__grid--text"><label><span>Reclamação *</span><textarea value={form.complaintText} onChange={(event) => set("complaintText", event.target.value)} rows="6" required /></label><label><span>Ação realizada *</span><textarea value={form.actionTaken} onChange={(event) => set("actionTaken", event.target.value)} rows="6" required /></label><label><span>Responsável pela tratativa *</span><input value={form.treatmentOwner} onChange={(event) => set("treatmentOwner", event.target.value)} maxLength="160" required /></label><label><span>Observação</span><textarea value={form.observation} onChange={(event) => set("observation", event.target.value)} rows="4" /></label><label className="sac-form__wide"><span>Resolução</span><textarea value={form.resolution} onChange={(event) => set("resolution", event.target.value)} rows="4" placeholder="Descreva a resolução, quando houver." /></label></div></section>
      <div className="sac-form__actions"><button type="submit" className="button button--ghost" disabled={saving}><Save size={17} />{saving ? "Salvando..." : canSubmit ? "Salvar rascunho" : "Salvar alterações"}</button>{canSubmit && <button type="button" className="button" disabled={saving} onClick={(event) => handleSubmit(event, true)}><Send size={17} />{existing?.workflowStatus === "DEVOLVIDA" ? "Salvar e reenviar" : "Salvar e enviar"}</button>}</div>
    </form>
  </section>;
}
