import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import SystemNotification, { useSystemNotification } from "../SystemNotification";
import { addDays, formatInterval, fortalezaDate, localInstant } from "./reservationDates";
import ResourceFeatures, { FEATURE_ICON_OPTIONS } from "./ResourceFeatures";

const blankType = { name: "", description: "", reservationMode: "TIME_SLOT", active: true, attributeDefinitions: [] };
const blankResource = { typeId: "", name: "", description: "", location: "", active: true, requiresApproval: false, attributes: {} };

function attributeKey(label) {
  return String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([0-9])/, "campo_$1").slice(0, 50);
}

function AdminTypes({ types, reload, notify }) {
  const [form, setForm] = useState(blankType);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const edit = (type) => { setEditingId(type.id); setForm({ name: type.name, description: type.description, reservationMode: type.reservationMode, active: type.active, attributeDefinitions: type.attributeDefinitions || [] }); };
  const updateDefinition = (index, field, value) => setForm((current) => ({
    ...current,
    attributeDefinitions: current.attributeDefinitions.map((definition, itemIndex) => {
      if (itemIndex !== index) return definition;
      if (field === "label") {
        const shouldRefreshKey = !definition.key || definition.key === attributeKey(definition.label);
        return { ...definition, label: value, key: shouldRefreshKey ? attributeKey(value) : definition.key };
      }
      return { ...definition, [field]: value };
    }),
  }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try { if (editingId) await api.put(`/admin/reservations/resource-types/${editingId}`, form); else await api.post("/admin/reservations/resource-types", form); notify("success", "Tipo de recurso salvo."); setEditingId(null); setForm(blankType); reload(); }
    catch (error) { notify("error", error.response?.data?.error || "Não foi possível salvar o tipo."); }
    finally { setSaving(false); }
  };
  return <div className="reservation-admin-grid"><form className="reservation-admin-form" onSubmit={save}><h3>{editingId ? "Editar tipo" : "Novo tipo"}</h3><label><span>Nome</span><input required maxLength="120" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><span>Descrição</span><textarea maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label><span>Modo</span><select value={form.reservationMode} onChange={(e) => setForm({ ...form, reservationMode: e.target.value })}><option value="TIME_SLOT">Horário</option><option value="PERIOD">Período de dias</option></select></label><div className="reservation-parameter-editor"><div><strong>Parâmetros dos recursos</strong><small>Estes campos serão solicitados em todo recurso deste tipo.</small></div>{form.attributeDefinitions.map((definition, index) => <div className="reservation-parameter-row" key={`${definition.key}-${index}`}><label><span>Nome</span><input required placeholder="Ex.: Possui TV" value={definition.label} onChange={(e) => updateDefinition(index, "label", e.target.value)} /></label><label><span>Formato</span><select value={definition.type} onChange={(e) => updateDefinition(index, "type", e.target.value)}><option value="BOOLEAN">Sim / não</option><option value="NUMBER">Número</option><option value="TEXT">Texto</option></select></label><label><span>Ícone</span><select value={definition.icon} onChange={(e) => updateDefinition(index, "icon", e.target.value)}>{FEATURE_ICON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" aria-label={`Remover ${definition.label || "parâmetro"}`} onClick={() => setForm({ ...form, attributeDefinitions: form.attributeDefinitions.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}<button type="button" className="button button--ghost" onClick={() => setForm({ ...form, attributeDefinitions: [...form.attributeDefinitions, { key: "", label: "", type: "BOOLEAN", icon: "other" }] })}>Adicionar parâmetro</button></div><label className="reservation-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Tipo ativo</span></label><div className="form-actions">{editingId && <button type="button" className="button button--ghost" onClick={() => { setEditingId(null); setForm(blankType); }}>Cancelar</button>}<button className="button" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div></form><div className="reservation-admin-list">{types.map((type) => <article key={type.id}><div><strong>{type.name}</strong><span>{type.reservationMode === "PERIOD" ? "Período" : "Horário"} · {type.active ? "Ativo" : "Inativo"}</span><small>{type.attributeDefinitions?.length || 0} parâmetro(s)</small></div><button type="button" className="button button--ghost" onClick={() => edit(type)}>Editar</button></article>)}</div></div>;
}

function AdminResources({ types, resources, reload, notify }) {
  const [form, setForm] = useState(blankResource);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const selectedType = useMemo(() => types.find((type) => String(type.id) === String(form.typeId)), [form.typeId, types]);
  const edit = (resource) => { setEditingId(resource.id); setForm({ ...resource, typeId: String(resource.typeId), attributes: resource.attributes || {} }); };
  const updateAttribute = (key, value) => setForm((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    const payload = { ...form, typeId: Number(form.typeId) };
    try { if (editingId) await api.put(`/admin/reservations/resources/${editingId}`, payload); else await api.post("/admin/reservations/resources", payload); notify("success", "Recurso salvo."); setEditingId(null); setForm(blankResource); reload(); }
    catch (error) { notify("error", error.response?.data?.error || "Não foi possível salvar o recurso."); }
    finally { setSaving(false); }
  };
  return <div className="reservation-admin-grid"><form className="reservation-admin-form" onSubmit={save}><h3>{editingId ? "Editar recurso" : "Novo recurso"}</h3><label><span>Tipo</span><select required value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value, attributes: {} })}><option value="">Selecione</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label><span>Nome</span><input required maxLength="120" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label><span>Localização</span><input maxLength="180" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label><span>Descrição</span><textarea maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>{!!selectedType?.attributeDefinitions?.length && <div className="reservation-resource-parameters"><strong>Características de {selectedType.name}</strong>{selectedType.attributeDefinitions.map((definition) => definition.type === "BOOLEAN" ? <label className="reservation-check" key={definition.key}><input type="checkbox" checked={form.attributes[definition.key] === true} onChange={(e) => updateAttribute(definition.key, e.target.checked)} /><span>{definition.label}</span></label> : <label key={definition.key}><span>{definition.label}</span><input type={definition.type === "NUMBER" ? "number" : "text"} min={definition.type === "NUMBER" ? "0" : undefined} value={form.attributes[definition.key] ?? ""} onChange={(e) => updateAttribute(definition.key, e.target.value)} /></label>)}</div>}{selectedType && !selectedType.attributeDefinitions?.length && <p className="reservation-form-hint">Este tipo ainda não possui parâmetros configurados.</p>}<label className="reservation-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Recurso ativo</span></label><label className="reservation-check"><input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} /><span>Marcar para aprovação futura (sem efeito no MVP)</span></label><div className="form-actions">{editingId && <button type="button" className="button button--ghost" onClick={() => { setEditingId(null); setForm(blankResource); }}>Cancelar</button>}<button className="button" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div></form><div className="reservation-admin-list">{resources.map((resource) => <article key={resource.id}><div><strong>{resource.name}</strong><span>{resource.type.name} · {resource.location || "Sem localização"} · {resource.active ? "Ativo" : "Inativo"}</span><ResourceFeatures resource={resource} /></div><button type="button" className="button button--ghost" onClick={() => edit(resource)}>Editar</button></article>)}</div></div>;
}

function AdminBlocks({ resources, blocks, reload, notify }) {
  const { confirm } = useSystemNotification();
  const tomorrow = addDays(fortalezaDate(), 1);
  const [form, setForm] = useState({ resourceId: "", startDate: tomorrow, endDate: tomorrow, startTime: "09:00", endTime: "10:00", reason: "" });
  const selected = useMemo(() => resources.find((resource) => String(resource.id) === form.resourceId), [form.resourceId, resources]);
  const isPeriod = selected?.type?.reservationMode === "PERIOD";
  const save = async (event) => {
    event.preventDefault();
    const interval = isPeriod ? { startDate: form.startDate, endDate: form.endDate } : { startAt: localInstant(form.startDate, form.startTime), endAt: localInstant(form.startDate, form.endTime) };
    try { await api.post("/admin/reservations/blocks", { resourceId: Number(form.resourceId), reason: form.reason, ...interval }); notify("success", "Bloqueio criado."); setForm({ ...form, reason: "" }); reload(); }
    catch (error) { notify("error", error.response?.data?.error || "Não foi possível criar o bloqueio."); }
  };
  const cancel = async (block) => { if (!await confirm(`Remover o bloqueio de ${block.resource.name}?`, { confirmLabel: "Remover bloqueio" })) return; try { await api.patch(`/admin/reservations/blocks/${block.id}/cancel`, {}); notify("success", "Bloqueio removido e preservado no histórico."); reload(); } catch (error) { notify("error", error.response?.data?.error || "Não foi possível remover o bloqueio."); } };
  return <div className="reservation-admin-grid"><form className="reservation-admin-form" onSubmit={save}><h3>Novo bloqueio</h3><label><span>Recurso</span><select required value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })}><option value="">Selecione</option>{resources.filter((resource) => resource.active).map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label><label><span>{isPeriod ? "Data inicial" : "Data"}</span><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>{isPeriod ? <label><span>Data final</span><input type="date" min={form.startDate} required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label> : <div className="reservation-inline-fields"><label><span>Início</span><input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label><label><span>Fim</span><input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label></div>}<label><span>Motivo</span><textarea required maxLength="500" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label><button className="button">Criar bloqueio</button></form><div className="reservation-admin-list">{blocks.map((block) => <article key={block.id}><div><strong>{block.resource.name}</strong><span>{formatInterval(block)} · {block.reason}</span><small>{block.status === "ACTIVE" ? "Ativo" : "Cancelado"}</small></div>{block.status === "ACTIVE" && <button type="button" className="button button--danger" onClick={() => cancel(block)}>Remover</button>}</article>)}</div></div>;
}

function AdminReservations({ reservations, reload, notify }) {
  const { confirm } = useSystemNotification();
  const cancel = async (item) => { if (!await confirm(`Cancelar a reserva de ${item.user?.name || "outro usuário"}?`, { confirmLabel: "Cancelar reserva" })) return; try { await api.patch(`/admin/reservations/${item.id}/cancel`, { reason: "Cancelada pela administração" }); notify("success", "Reserva cancelada."); reload(); } catch (error) { notify("error", error.response?.data?.error || "Não foi possível cancelar a reserva."); } };
  return <div className="reservation-admin-list reservation-admin-list--wide">{reservations.map((item) => <article key={item.id}><div><strong>{item.resource.name}</strong><span>{formatInterval(item)} · {item.user?.name} · {item.purpose}</span><small>{item.status === "CONFIRMED" ? "Confirmada" : "Cancelada"}</small></div>{item.status === "CONFIRMED" && <button type="button" className="button button--danger" onClick={() => cancel(item)}>Cancelar</button>}</article>)}</div>;
}

export default function ReservationAdmin({ refreshToken, onChanged }) {
  const [tab, setTab] = useState("resources");
  const [data, setData] = useState({ types: [], resources: [], blocks: [], reservations: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const notify = (variant, text) => setMessage({ variant, text });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [types, resources, blocks, reservations] = await Promise.all([
        api.get("/admin/reservations/resource-types"), api.get("/admin/reservations/resources"),
        api.get("/admin/reservations/blocks"), api.get("/admin/reservations?pageSize=100"),
      ]);
      setData({ types: types.data, resources: resources.data, blocks: blocks.data, reservations: reservations.data.items });
    } catch (error) { notify("error", error.response?.data?.error || "Não foi possível carregar a administração."); }
    finally { setLoading(false); }
  }, []);
  const reload = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  useEffect(() => { load(); }, [load, refreshToken]);
  return <section className="reservation-section"><div><h2>Administração</h2><p className="section-copy">Cadastros, bloqueios e histórico geral do módulo.</p></div>{message && <SystemNotification variant={message.variant}>{message.text}</SystemNotification>}<div className="reservation-subtabs">{[["resources", "Recursos"], ["types", "Tipos"], ["blocks", "Bloqueios"], ["reservations", "Todas as reservas"]].map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</div>{loading ? <div className="reservation-empty">Carregando administração...</div> : <>{tab === "types" && <AdminTypes types={data.types} reload={reload} notify={notify} />}{tab === "resources" && <AdminResources types={data.types} resources={data.resources} reload={reload} notify={notify} />}{tab === "blocks" && <AdminBlocks resources={data.resources} blocks={data.blocks} reload={reload} notify={notify} />}{tab === "reservations" && <AdminReservations reservations={data.reservations} reload={reload} notify={notify} />}</>}</section>;
}
