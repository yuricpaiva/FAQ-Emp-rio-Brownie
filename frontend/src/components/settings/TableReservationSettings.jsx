import { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Save, Utensils } from "lucide-react";
import api from "../../services/api";
import SystemNotification from "../SystemNotification";
import "../../styles/table-reservations.css";

function AccessList({ title, description, users, selectedIds, onChange }) {
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  return <section className="sac-settings__access"><div><h3>{title}</h3><p>{description}</p></div><div className="settings-user-list">{users.map((user) => <label key={user.id} className="settings-user-item"><input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggle(user.id)} />{user.photoUrl ? <img src={user.photoUrl} alt="" loading="lazy" /> : <span className="settings-user-item__avatar">{user.name.slice(0, 2).toUpperCase()}</span>}<span><strong>{user.name}</strong><small>{user.email}</small></span></label>)}{!users.length && <p className="empty-state">Nenhum usuário elegível.</p>}</div></section>;
}

function UnitAccessList({ units, selectedIds, onChange }) {
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  return <section className="sac-settings__access table-reservation-unit-access"><div><h3>Unidades que trabalham com reservas</h3><p>Somente as lojas marcadas aparecerão nos filtros e no cadastro de reservas.</p></div><div className="settings-user-list">{units.map((unit) => <label key={unit.id} className="settings-user-item"><input type="checkbox" checked={selectedIds.includes(unit.id)} onChange={() => toggle(unit.id)} /><span className="settings-user-item__avatar"><MapPin size={17} aria-hidden="true" /></span><span><strong>{unit.name}</strong><small>{selectedIds.includes(unit.id) ? "Disponível na Central de Reservas" : "Não aparece nos seletores"}</small></span></label>)}{!units.length && <p className="empty-state">Nenhuma unidade ativa encontrada.</p>}</div></section>;
}

const emptyForm = { id: null, unitId: "", name: "", capacity: "", active: true };

export default function TableReservationSettings() {
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [tables, setTables] = useState([]);
  const [creatorUserIds, setCreatorUserIds] = useState([]);
  const [viewerUserIds, setViewerUserIds] = useState([]);
  const [enabledUnitIds, setEnabledUnitIds] = useState([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadTables = async () => setTables((await api.get("/admin/restaurant-tables")).data);
  useEffect(() => {
    Promise.all([
      api.get("/admin/table-reservation-settings"), api.get("/admin/users"),
      api.get("/admin/production-stores"), api.get("/admin/restaurant-tables"),
    ]).then(([settingsResponse, usersResponse, unitsResponse, tablesResponse]) => {
      setCreatorUserIds(settingsResponse.data.creatorUserIds); setViewerUserIds(settingsResponse.data.viewerUserIds); setEnabledUnitIds(settingsResponse.data.enabledUnitIds || []);
      setUsers(usersResponse.data.filter((user) => user.active));
      const nextUnits = unitsResponse.data.filter((unit) => unit.active).map((unit) => ({ id: unit.id, name: unit.displayName }));
      setUnits(nextUnits); setTables(tablesResponse.data);
      setForm((current) => ({ ...current, unitId: String(nextUnits[0]?.id || "") }));
    }).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar as configurações de reservas." }))
      .finally(() => setLoading(false));
  }, []);

  const saveAccess = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try {
      const response = await api.put("/admin/table-reservation-settings", { creatorUserIds, viewerUserIds, enabledUnitIds });
      setCreatorUserIds(response.data.creatorUserIds); setViewerUserIds(response.data.viewerUserIds); setEnabledUnitIds(response.data.enabledUnitIds);
      window.dispatchEvent(new CustomEvent("table-reservations-settings-updated"));
      setNotice({ variant: "success", text: "Permissões e unidades da Central de Reservas salvas." });
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar as configurações." }); }
    finally { setSaving(false); }
  };

  const saveTable = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    const payload = { unitId: Number(form.unitId), name: form.name, capacity: form.capacity === "" ? null : Number(form.capacity), active: form.active };
    try {
      if (form.id) await api.put(`/admin/restaurant-tables/${form.id}`, payload);
      else await api.post("/admin/restaurant-tables", payload);
      await loadTables();
      setForm({ ...emptyForm, unitId: form.unitId });
      setNotice({ variant: "success", text: form.id ? "Mesa atualizada." : "Mesa cadastrada." });
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar a mesa." }); }
    finally { setSaving(false); }
  };

  const edit = (table) => setForm({ id: table.id, unitId: String(table.productionStoreId), name: table.name, capacity: table.capacity ?? "", active: table.active });
  const toggle = async (table) => {
    setSaving(true); setNotice(null);
    try {
      await api.put(`/admin/restaurant-tables/${table.id}`, { unitId: table.productionStoreId, name: table.name, capacity: table.capacity, active: !table.active });
      await loadTables(); setNotice({ variant: "success", text: table.active ? "Mesa inativada." : "Mesa ativada." });
    } catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível alterar a mesa." }); }
    finally { setSaving(false); }
  };
  const visibleTables = useMemo(() => tables.filter((table) => !unitFilter || String(table.productionStoreId) === unitFilter), [tables, unitFilter]);

  if (loading) return <section className="surface-card settings-panel">Carregando configurações de reservas...</section>;
  return <div className="settings-tab-content sac-settings">
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
    <form className="surface-card settings-panel" onSubmit={saveAccess}>
      <div className="settings-panel__heading"><div className="sac-settings__icon" aria-hidden="true"><Utensils size={22} /></div><div><h2>Acesso à Central de Reservas</h2><p>Selecione cada usuário individualmente. Nenhum perfil recebe acesso automático.</p></div></div>
      <div className="sac-settings__access-grid"><AccessList title="Operação completa" description="Podem criar, consultar e confirmar o comparecimento. Usuários de loja ficam limitados à própria unidade." users={users} selectedIds={creatorUserIds} onChange={(ids) => { setCreatorUserIds(ids); setViewerUserIds((current) => current.filter((id) => !ids.includes(id))); }} /><AccessList title="Consulta somente leitura" description="Podem acompanhar reservas, sem cadastrar ou confirmar comparecimento. Usuários de loja ficam limitados à própria unidade." users={users} selectedIds={viewerUserIds} onChange={(ids) => { setViewerUserIds(ids); setCreatorUserIds((current) => current.filter((id) => !ids.includes(id))); }} /></div>
      <UnitAccessList units={units} selectedIds={enabledUnitIds} onChange={setEnabledUnitIds} />
      <div className="settings-panel__actions"><button className="button" disabled={saving}><Save size={16} />{saving ? "Salvando..." : "Salvar permissões e unidades"}</button></div>
    </form>
    <section className="surface-card settings-panel">
      <div className="settings-panel__heading"><div><h2>Mesas por unidade</h2><p>Cadastre a identificação usada pela loja no momento do comparecimento.</p></div></div>
      <form className="table-settings-form" onSubmit={saveTable}>
        <label className="settings-field"><span>Unidade</span><select value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })} disabled={Boolean(form.id)} required><option value="">Selecione</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>{form.id && <small>A unidade é preservada para manter o histórico da mesa.</small>}</label>
        <label className="settings-field"><span>Nome da mesa</span><input maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Mesa 01" required /></label>
        <label className="settings-field"><span>Capacidade</span><input type="number" min="1" max="500" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} placeholder="Opcional" /></label>
        <label className="settings-toggle table-settings-active"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span className="settings-toggle__control" aria-hidden="true" /><span><strong>Mesa ativa</strong></span></label>
        <div className="table-settings-form__actions">{form.id && <button type="button" className="button button--ghost" onClick={() => setForm({ ...emptyForm, unitId: form.unitId })}>Cancelar edição</button>}<button className="button" disabled={saving}><Plus size={16} />{form.id ? "Salvar mesa" : "Adicionar mesa"}</button></div>
      </form>
      <div className="table-settings-list-heading"><div><strong>Mesas cadastradas</strong><span>{visibleTables.length} registro{visibleTables.length === 1 ? "" : "s"}</span></div><select aria-label="Filtrar mesas por unidade" value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}><option value="">Todas as unidades</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></div>
      <div className="faq-table-wrap"><table className="faq-table forms-responsive-table table-settings-table"><thead><tr><th>Mesa</th><th>Unidade</th><th>Capacidade</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visibleTables.map((table) => <tr key={table.id} className={!table.active ? "is-inactive" : ""}><td data-label="Mesa"><strong>{table.name}</strong></td><td data-label="Unidade">{table.unit.name}</td><td data-label="Capacidade">{table.capacity || "—"}</td><td data-label="Status">{table.active ? "Ativa" : "Inativa"}</td><td data-label="Ações"><div className="faq-table-actions"><button type="button" onClick={() => edit(table)}>Editar</button><button type="button" disabled={saving} onClick={() => toggle(table)}>{table.active ? "Inativar" : "Ativar"}</button></div></td></tr>)}{!visibleTables.length && <tr><td colSpan="5" className="faq-table-empty">Nenhuma mesa cadastrada.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
