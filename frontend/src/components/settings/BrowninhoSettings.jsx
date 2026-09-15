import { useEffect, useState } from "react";
import { Bot, CheckCircle2, KeyRound, TestTube2 } from "lucide-react";
import SystemNotification from "../SystemNotification";
import api from "../../services/api";

const ROLE_LABELS = { admin: "Administrador", creator: "Criador de conteúdo", production_manager: "Gerente de produção", reader: "Leitor", store: "Loja" };

function Toggle({ checked, onChange, title, description, disabled }) {
  return <label className="settings-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="settings-toggle__control" aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span></label>;
}

function BrowninhoSettings() {
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    api.get("/admin/ai-settings").then((response) => setForm(response.data)).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar as configurações do Browninho." }));
  }, []);
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setNotice(null);
    try { const response = await api.put("/admin/ai-settings", form); setForm(response.data); setNotice({ variant: "success", text: "Configurações do Browninho salvas com sucesso." }); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível salvar as configurações." }); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true); setNotice(null);
    try { const response = await api.post("/admin/ai-settings/test"); setNotice({ variant: "success", text: response.data.message }); }
    catch (error) { setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível validar a conexão." }); }
    finally { setTesting(false); }
  };
  const toggleRole = (role) => set("salesRoles", form.salesRoles.includes(role) ? form.salesRoles.filter((item) => item !== role) : [...form.salesRoles, role]);

  if (!form) return <section className="surface-card settings-panel settings-tab-content"><p>{notice?.text || "Carregando configurações do Browninho..."}</p></section>;
  return <form className="surface-card settings-panel settings-tab-content browninho-settings" onSubmit={save}>
    <div className="settings-panel__heading"><span className="browninho-settings__icon"><Bot size={25} /></span><div><h2>Browninho</h2><p>Defina o comportamento, as fontes disponíveis e os limites do agente.</p></div></div>
    <div className={`browninho-key-status ${form.configured ? "is-configured" : "is-missing"}`}><KeyRound size={20} /><div><strong>{form.configured ? "Chave da OpenAI configurada" : "Chave da OpenAI pendente"}</strong><small>{form.configured ? "O token está disponível somente no servidor e não é exibido nesta tela." : <>Adicione <code>OPENAI_API_KEY</code> ao arquivo <code>backend/.env</code> e reinicie o backend.</>}</small></div>{form.configured && <CheckCircle2 size={19} />}</div>
    <Toggle checked={form.enabled} onChange={(value) => set("enabled", value)} title="Habilitar Browninho" description="Disponibiliza conversas reais aos usuários autenticados." disabled={saving} />
    <div className="browninho-settings__grid">
      <label className="settings-field"><span>Modelo de texto</span><input value={form.model} onChange={(event) => set("model", event.target.value)} required /><small>Modelo usado para respostas, ferramentas e análise.</small></label>
      <label className="settings-field"><span>Modelo de imagem</span><input value={form.imageModel} onChange={(event) => set("imageModel", event.target.value)} required /><small>Usado somente na geração de imagens.</small></label>
      <label className="settings-field"><span>Limite de saída (tokens)</span><input type="number" min="256" max="16000" value={form.maxOutputTokens} onChange={(event) => set("maxOutputTokens", Number(event.target.value))} required /></label>
      <label className="settings-field"><span>Mensagens no histórico</span><input type="number" min="2" max="60" value={form.maxHistoryMessages} onChange={(event) => set("maxHistoryMessages", Number(event.target.value))} required /></label>
      <label className="settings-field"><span>Período máximo de vendas (dias)</span><input type="number" min="1" max="1096" value={form.maxSalesRangeDays} onChange={(event) => set("maxSalesRangeDays", Number(event.target.value))} required /></label>
    </div>
    <label className="settings-field"><span>Instruções adicionais do agente</span><textarea rows="7" maxLength="12000" value={form.instructions} onChange={(event) => set("instructions", event.target.value)} placeholder="Ex.: responda de forma resumida e priorize os procedimentos internos..." /><small>Estas instruções complementam as regras de segurança e acesso, que não podem ser substituídas.</small></label>
    <div className="browninho-settings__capabilities"><h3>Capacidades</h3>
      <Toggle checked={form.faqKnowledgeEnabled} onChange={(value) => set("faqKnowledgeEnabled", value)} title="Conhecimento do FAQ" description="Pesquisa artigos publicados e referencia os links encontrados." disabled={saving} />
      <Toggle checked={form.salesEnabled} onChange={(value) => set("salesEnabled", value)} title="Vendas e ticket médio" description="Consulta indicadores reais por ferramentas somente de leitura." disabled={saving} />
      <Toggle checked={form.documentsEnabled} onChange={(value) => set("documentsEnabled", value)} title="Análise de documentos" description="Aceita documentos, planilhas, textos e imagens enviados na conversa." disabled={saving} />
      <Toggle checked={form.imagesEnabled} onChange={(value) => set("imagesEnabled", value)} title="Geração de imagens" description="Permite ao Browninho criar imagens quando solicitado." disabled={saving} />
    </div>
    <fieldset className="browninho-settings__roles" disabled={!form.salesEnabled || saving}><legend>Perfis autorizados a consultar vendas</legend><div>{Object.entries(ROLE_LABELS).map(([role, label]) => <label key={role}><input type="checkbox" checked={form.salesRoles.includes(role)} onChange={() => toggleRole(role)} />{label}</label>)}</div></fieldset>
    <div className="settings-panel__actions"><button type="button" className="button button--ghost" onClick={test} disabled={testing || !form.configured}><TestTube2 size={17} />{testing ? "Testando..." : "Testar conexão"}</button><button type="submit" className="button" disabled={saving}>{saving ? "Salvando..." : "Salvar Browninho"}</button></div>
    {notice && <SystemNotification variant={notice.variant} onDismiss={() => setNotice(null)}>{notice.text}</SystemNotification>}
  </form>;
}

export default BrowninhoSettings;
