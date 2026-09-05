import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";
import { modelPayload, questionTypeLabels, roleLabels } from "../utils/forms";

const roles = Object.keys(roleLabels);
const blankQuestion = () => ({ text: "", type: "TEXT", required: false, allowPhoto: false, photoRequired: false, allowObservation: false, weight: 1 });
const blank = { name: "", description: "", active: true, resultType: "SIMPLE", scoreMin: 0, scoreMax: 10, scoreCalculationType: "SIMPLE_AVERAGE", requiresApproval: false, requiresStore: false, defaultObserverId: null, questions: [blankQuestion()], permissions: { fillRoles: [], fillUserIds: [], approveRoles: [], approveUserIds: [] } };

function PermissionEditor({ title, rolesValue, usersValue, users, onRoles, onUsers }) {
  const toggle = (values, value, setter) => setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return <fieldset className="forms-permission"><legend>{title}</legend><p>Por papel</p><div className="forms-check-grid">{roles.map((role) => <label key={role}><input type="checkbox" checked={rolesValue.includes(role)} onChange={() => toggle(rolesValue, role, onRoles)} /><span>{roleLabels[role]}</span></label>)}</div><p>Usuários específicos</p><div className="forms-check-grid forms-check-grid--users">{users.map((user) => <label key={user.id}><input type="checkbox" checked={usersValue.includes(user.id)} onChange={() => toggle(usersValue, user.id, onUsers)} /><span>{user.name}<small>{user.email}</small></span></label>)}</div>{!users.length && <span className="forms-muted">Nenhum usuário ativo disponível.</span>}</fieldset>;
}

function DefaultObserverControl({ value, users, onChange }) {
  return <details className={`forms-observer-menu forms-observer-menu--model ${value ? "has-observer" : ""}`}>
    <summary aria-label="Observador padrão" title="Observador padrão">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.5-4 2.8-6 7-6s6.5 2 7 6" /></svg>
      {value && <span aria-hidden="true" />}
    </summary>
    <div className="forms-observer-menu__panel">
      <strong>Observador padrão</strong>
      <p>Quando definido, será obrigatório e não poderá ser trocado no preenchimento.</p>
      <select value={value || ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} aria-label="Selecionar observador padrão"><option value="">Sem observador padrão</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
    </div>
  </details>;
}

function FormModelEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(blank);
  const [users, setUsers] = useState([]);
  const [observerUsers, setObserverUsers] = useState([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/admin/users").then((response) => response.data.filter((user) => user.active)),
      api.get("/admin/forms-settings").then((response) => response.data.userIds),
      id ? api.get(`/forms/models/${id}`).then((response) => response.data) : Promise.resolve(null),
    ]).then(([nextUsers, formsUserIds, model]) => {
      setUsers(nextUsers);
      setObserverUsers(nextUsers.filter((user) => user.role === "admin" || formsUserIds.includes(user.id)));
      if (model) setForm(modelPayload(model));
    }).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar o editor." })).finally(() => setLoading(false));
  }, [id]);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setPermission = (field, value) => setForm((current) => ({ ...current, permissions: { ...current.permissions, [field]: value } }));
  const setQuestion = (index, field, value) => setForm((current) => ({ ...current, questions: current.questions.map((question, itemIndex) => itemIndex === index ? { ...question, [field]: value } : question) }));
  const setPhotoRegistration = (index, enabled) => setForm((current) => ({ ...current, questions: current.questions.map((question, itemIndex) => itemIndex === index ? { ...question, allowPhoto: enabled, photoRequired: enabled ? question.photoRequired : false } : question) }));
  const move = (index, direction) => setForm((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.questions.length) return current;
    const questions = [...current.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    return { ...current, questions };
  });
  const remove = (index) => setForm((current) => ({ ...current, questions: current.questions.filter((_, itemIndex) => itemIndex !== index) }));

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try {
      if (id) await api.put(`/forms/models/${id}`, form); else await api.post("/forms/models", form);
      navigate("/forms/modelos", { replace: true });
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar o modelo." }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="forms-empty">Carregando editor...</div>;
  return <section className="page-stack forms-page"><header className="forms-hero forms-model-editor-hero"><div><button type="button" className="forms-back" onClick={() => navigate("/forms/modelos")}>← Voltar</button><p className="eyebrow">Formulários</p><h1>{id ? "Editar modelo" : "Novo modelo"}</h1><p>Defina a estrutura, as permissões e o resultado deste formulário.</p></div><DefaultObserverControl value={form.defaultObserverId} users={observerUsers} onChange={(value) => set("defaultObserverId", value)} /></header>{notice && <SystemNotification variant={notice.variant}>{notice.text}</SystemNotification>}
    <form className="forms-editor" onSubmit={save}>
      <section className="forms-panel"><h2>Informações gerais</h2><div className="forms-editor-grid"><label><span>Nome</span><input value={form.name} onChange={(event) => set("name", event.target.value)} required maxLength={160} /></label><label className="forms-span-2"><span>Descrição</span><textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} /></label><label><span>Tipo de resultado</span><select value={form.resultType} onChange={(event) => set("resultType", event.target.value)}><option value="SIMPLE">Simples</option><option value="SCORE">Pontuação</option></select></label><label className="forms-toggle-label"><input type="checkbox" checked={form.active} onChange={(event) => set("active", event.target.checked)} /><span>Modelo ativo</span></label><label className="forms-toggle-label"><input type="checkbox" checked={form.requiresApproval} onChange={(event) => set("requiresApproval", event.target.checked)} /><span>Exige aprovação</span></label><label className="forms-toggle-label"><input type="checkbox" checked={form.requiresStore} onChange={(event) => set("requiresStore", event.target.checked)} /><span>Informar loja?</span></label></div>
        {form.resultType === "SCORE" && <div className="forms-score-config"><label><span>Nota mínima</span><input type="number" step="any" value={form.scoreMin} onChange={(event) => set("scoreMin", event.target.value)} /></label><label><span>Nota máxima</span><input type="number" step="any" value={form.scoreMax} onChange={(event) => set("scoreMax", event.target.value)} /></label><label><span>Cálculo</span><select value={form.scoreCalculationType} onChange={(event) => set("scoreCalculationType", event.target.value)}><option value="SIMPLE_AVERAGE">Média simples</option><option value="WEIGHTED_AVERAGE">Média ponderada</option></select></label></div>}
      </section>
      <section className="forms-panel"><div className="forms-section-heading"><div><h2>Perguntas</h2><p>O preenchimento seguirá esta ordem.</p></div><button type="button" className="button button--ghost" onClick={() => set("questions", [...form.questions, blankQuestion()])}>+ Adicionar pergunta</button></div><div className="forms-question-list">{form.questions.map((question, index) => <article className="forms-question-editor" key={index}><div className="forms-question-number">{index + 1}</div><div className="forms-question-fields"><label className="forms-span-2"><span>Pergunta</span><input value={question.text} onChange={(event) => setQuestion(index, "text", event.target.value)} required /></label><label><span>Tipo</span><select value={question.type} onChange={(event) => { const type = event.target.value; setForm((current) => ({ ...current, questions: current.questions.map((item, itemIndex) => itemIndex === index ? { ...item, type, allowPhoto: type === "PHOTO" ? true : item.allowPhoto } : item) })); }}>{Object.entries(questionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Peso</span><input type="number" min="0.0001" step="any" value={question.weight} onChange={(event) => setQuestion(index, "weight", event.target.value)} /></label><label className="forms-toggle-label"><input type="checkbox" checked={question.required} onChange={(event) => setQuestion(index, "required", event.target.checked)} /><span>Obrigatória</span></label><label className="forms-toggle-label"><input type="checkbox" checked={question.allowPhoto || question.photoRequired || question.type === "PHOTO"} onChange={(event) => setPhotoRegistration(index, event.target.checked)} /><span>Registro fotográfico</span></label>{(question.allowPhoto || question.photoRequired || question.type === "PHOTO") && <label className="forms-toggle-label forms-photo-required-option"><input type="checkbox" checked={question.photoRequired} onChange={(event) => setQuestion(index, "photoRequired", event.target.checked)} /><span>O registro é obrigatório?</span></label>}<label className="forms-toggle-label"><input type="checkbox" checked={question.allowObservation} onChange={(event) => setQuestion(index, "allowObservation", event.target.checked)} /><span>Aceitar observação</span></label></div><div className="forms-question-actions"><button type="button" onClick={() => move(index, -1)} disabled={!index} aria-label="Mover para cima">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === form.questions.length - 1} aria-label="Mover para baixo">↓</button><button type="button" onClick={() => remove(index)} disabled={form.questions.length === 1} aria-label="Remover pergunta">×</button></div></article>)}</div></section>
      <section className="forms-panel"><h2>Permissões</h2><p className="forms-muted">Sem permissão de preenchimento, somente administradores poderão iniciar o modelo.</p><div className="forms-permission-grid"><PermissionEditor title="Quem pode preencher" rolesValue={form.permissions.fillRoles} usersValue={form.permissions.fillUserIds} users={users} onRoles={(value) => setPermission("fillRoles", value)} onUsers={(value) => setPermission("fillUserIds", value)} />{form.requiresApproval && <PermissionEditor title="Quem pode aprovar" rolesValue={form.permissions.approveRoles} usersValue={form.permissions.approveUserIds} users={users} onRoles={(value) => setPermission("approveRoles", value)} onUsers={(value) => setPermission("approveUserIds", value)} />}</div></section>
      <div className="forms-sticky-actions"><button type="button" className="button button--ghost" onClick={() => navigate("/forms/modelos")}>Cancelar</button><button className="button" disabled={saving}>{saving ? "Salvando..." : "Salvar modelo"}</button></div>
    </form>
  </section>;
}

export default FormModelEditor;
