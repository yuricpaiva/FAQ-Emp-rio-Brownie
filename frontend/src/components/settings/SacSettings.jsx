import { useEffect, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";
import api from "../../services/api";
import SystemNotification from "../SystemNotification";
import { sacOptionCategories } from "../../utils/sac";

function AccessList({ title, description, users, selectedIds, onChange }) {
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  return <section className="sac-settings__access"><div><h3>{title}</h3><p>{description}</p></div><div className="settings-user-list">{users.map((user) => <label key={user.id} className="settings-user-item"><input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggle(user.id)} />{user.photoUrl ? <img src={user.photoUrl} alt="" /> : <span className="settings-user-item__avatar">{user.name.slice(0, 2).toUpperCase()}</span>}<span><strong>{user.name}</strong><small>{user.email}</small></span></label>)}</div></section>;
}

function OptionGroup({ category, label, options, onCreated, onUpdated, onError }) {
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const create = async (event) => {
    event.preventDefault(); if (!newLabel.trim()) return; setSaving(true);
    try { const response = await api.post("/admin/sac-options", { category, label: newLabel }); onCreated(response.data); setNewLabel(""); }
    catch (error) { onError(error.response?.data?.error || "Não foi possível criar a opção."); }
    finally { setSaving(false); }
  };
  const update = async (option, changes) => {
    try { const response = await api.put(`/admin/sac-options/${option.id}`, changes); onUpdated(response.data); }
    catch (error) { onError(error.response?.data?.error || "Não foi possível atualizar a opção."); }
  };
  return <section className="sac-option-group"><div className="sac-option-group__heading"><h3>{label}</h3><span>{options.filter((item) => item.active).length} ativa{options.filter((item) => item.active).length === 1 ? "" : "s"}</span></div><div className="sac-option-list">{options.map((option) => <div key={option.id} className={!option.active ? "is-inactive" : ""}><input aria-label={`Nome de ${label}`} defaultValue={option.label} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== option.label) update(option, { label: value }); else event.target.value = option.label; }} /><label className="sac-option-toggle"><input type="checkbox" checked={option.active} onChange={(event) => update(option, { active: event.target.checked })} /><span>{option.active ? "Ativa" : "Inativa"}</span></label></div>)}</div><form className="sac-option-add" onSubmit={create}><input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={`Adicionar em ${label.toLocaleLowerCase("pt-BR")}`} aria-label={`Nova opção em ${label}`} /><button className="button button--ghost" disabled={saving || !newLabel.trim()}><Plus size={16} />Adicionar</button></form></section>;
}

export default function SacSettings() {
  const [users, setUsers] = useState([]);
  const [creatorUserIds, setCreatorUserIds] = useState([]);
  const [viewerUserIds, setViewerUserIds] = useState([]);
  const [auditorUserId, setAuditorUserId] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    Promise.all([api.get("/admin/sac-settings"), api.get("/admin/users")]).then(([settingsResponse, usersResponse]) => {
      setCreatorUserIds(settingsResponse.data.creatorUserIds); setViewerUserIds(settingsResponse.data.viewerUserIds); setAuditorUserId(String(settingsResponse.data.auditorUserId || "")); setOptions(settingsResponse.data.options); setUsers(usersResponse.data.filter((user) => user.active));
    }).catch(() => setNotice({ variant: "error", text: "Não foi possível carregar as configurações do SAC." })).finally(() => setLoading(false));
  }, []);
  const grouped = useMemo(() => Object.fromEntries(sacOptionCategories.map(([category]) => [category, options.filter((item) => item.category === category)])), [options]);
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try { await api.put("/admin/sac-settings", { creatorUserIds, viewerUserIds, auditorUserId: auditorUserId ? Number(auditorUserId) : null }); window.dispatchEvent(new CustomEvent("sac-settings-updated")); setNotice({ variant: "success", text: "Acessos e auditor do SAC foram salvos." }); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar as configurações do SAC." }); }
    finally { setSaving(false); }
  };
  const mergeOption = (next) => setOptions((current) => current.map((item) => item.id === next.id ? next : item));
  if (loading) return <section className="surface-card settings-panel">Carregando configurações do SAC...</section>;
  return <div className="settings-tab-content sac-settings">
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <form className="surface-card settings-panel" onSubmit={save}><div className="settings-panel__heading"><div className="sac-settings__icon" aria-hidden="true">SAC</div><div><h2>Acessos e auditoria</h2><p>Defina quem cadastra, quem consulta e quem conclui as auditorias.</p></div></div><label className="settings-field"><span>Auditor responsável</span><select value={auditorUserId} onChange={(event) => setAuditorUserId(event.target.value)}><option value="">Nenhum auditor configurado</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select><small>Somente esta pessoa poderá devolver ou concluir auditorias. Administradores não substituem o auditor.</small></label><div className="sac-settings__access-grid"><AccessList title="Permissão de cadastro" description="Podem criar e consultar todas as reclamações." users={users} selectedIds={creatorUserIds} onChange={setCreatorUserIds} /><AccessList title="Consulta somente leitura" description="Podem consultar todos os registros, sem cadastrar." users={users} selectedIds={viewerUserIds} onChange={setViewerUserIds} /></div><div className="settings-panel__actions"><button className="button" disabled={saving}><Save size={16} />{saving ? "Salvando..." : "Salvar acessos do SAC"}</button></div></form>
    <section className="surface-card settings-panel"><div className="settings-panel__heading"><div><h2>Listas do formulário</h2><p>Padronize os valores usados no cadastro e nos filtros. Opções inativas permanecem no histórico.</p></div></div><div className="sac-option-groups">{sacOptionCategories.map(([category, label]) => <OptionGroup key={category} category={category} label={label} options={grouped[category] || []} onCreated={(option) => setOptions((current) => [...current, option])} onUpdated={mergeOption} onError={(text) => setNotice({ variant: "error", text })} />)}</div></section>
  </div>;
}
