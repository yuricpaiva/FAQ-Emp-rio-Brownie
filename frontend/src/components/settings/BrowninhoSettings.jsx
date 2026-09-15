import { useEffect, useState } from "react";
import { Bot, CheckCircle2, CircleDollarSign, KeyRound, RefreshCw, TestTube2 } from "lucide-react";
import SystemNotification from "../SystemNotification";
import api from "../../services/api";

const ROLE_LABELS = { admin: "Administrador", creator: "Criador de conteúdo", production_manager: "Gerente de produção", reader: "Leitor", store: "Loja" };
const usdFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

function formatUsageDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Fortaleza" }).format(new Date(value));
}

function Toggle({ checked, onChange, title, description, disabled }) {
  return <label className="settings-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="settings-toggle__control" aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span></label>;
}

function BrowninhoSettings() {
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [usage, setUsage] = useState({ loading: true, data: null, error: "" });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const loadUsage = async () => {
    setUsage((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await api.get("/admin/ai-settings/usage");
      setUsage({ loading: false, data: response.data, error: "" });
    } catch (error) {
      setUsage({ loading: false, data: null, error: error.response?.data?.error || "Não foi possível consultar o gasto na OpenAI." });
    }
  };

  useEffect(() => {
    api.get("/admin/ai-settings").then((response) => setForm(response.data)).catch((error) => setNotice({ variant: "error", text: error.response?.data?.error || "Não foi possível carregar as configurações do Browninho." }));
    loadUsage();
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
    <section className="browninho-usage" aria-labelledby="browninho-usage-title">
      <header className="browninho-usage__header">
        <div><span className="browninho-usage__icon"><CircleDollarSign size={20} /></span><div><h3 id="browninho-usage-title">Gasto real na OpenAI</h3><p>Valores oficiais acumulados no mês atual.</p></div></div>
        <button type="button" className="button button--ghost browninho-usage__refresh" onClick={loadUsage} disabled={usage.loading}><RefreshCw size={16} className={usage.loading ? "is-spinning" : ""} />Atualizar</button>
      </header>
      {usage.loading && !usage.data && <div className="browninho-usage__loading" role="status">Consultando a OpenAI...</div>}
      {usage.error && <div className="browninho-usage__unavailable" role="alert"><strong>Não foi possível atualizar o gasto.</strong><span>{usage.error}</span></div>}
      {!usage.loading && usage.data && !usage.data.configured && <div className="browninho-usage__unavailable"><strong>Painel financeiro não conectado</strong><span>Adicione <code>OPENAI_ADMIN_KEY</code> ao backend. Para mostrar somente o Browninho, configure também <code>OPENAI_PROJECT_ID</code>.</span></div>}
      {usage.data?.configured && <>
        <div className={`browninho-usage__metrics ${usage.data.spendLimit ? "has-limit" : ""}`}>
          <div><span>Gasto no mês</span><strong>{usdFormatter.format(usage.data.usdSpent || 0)}</strong></div>
          {usage.data.spendLimit && <div><span>Limite mensal</span><strong>{usdFormatter.format(usage.data.spendLimit.amount)}</strong></div>}
          {usage.data.spendLimit && <div><span>Disponível até o limite</span><strong>{usdFormatter.format(usage.data.spendLimit.remaining)}</strong></div>}
        </div>
        {usage.data.spendLimit && <div className="browninho-usage__progress"><div><span>Consumo do limite</span><strong>{usage.data.spendLimit.usedPercent.toFixed(1).replace(".", ",")}%</strong></div><div className="browninho-usage__track" role="progressbar" aria-label="Consumo do limite mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(usage.data.spendLimit.usedPercent)}><span style={{ width: `${usage.data.spendLimit.usedPercent}%` }} /></div></div>}
        <footer className="browninho-usage__footer"><span>{usage.data.scope === "project" ? "Projeto do Browninho" : "Organização inteira"}</span><span>Atualizado em {formatUsageDate(usage.data.updatedAt)}</span></footer>
        {!usage.data.projectFilterConfigured && <small className="browninho-usage__scope-warning">Configure <code>OPENAI_PROJECT_ID</code> para não somar outros projetos da organização.</small>}
        {!usage.data.spendLimit && <small className="browninho-usage__scope-warning">A OpenAI não retornou um limite mensal. O gasto exibido continua sendo o valor real do período.</small>}
      </>}
    </section>
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
