import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";
import BrowninhoSettings from "../components/settings/BrowninhoSettings";
import SacSettings from "../components/settings/SacSettings";
import { parseMoneyToCents } from "../utils/purchaseOrders";

const formatMoneyInput = (cents) => (Number(cents || 0) / 100).toFixed(2).replace(".", ",");

function UserSelector({ users, selectedIds, onChange }) {
  const toggle = (userId) => onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  return <div className="settings-user-selector"><div className="settings-user-selector__actions"><button type="button" onClick={() => onChange(users.map((user) => user.id))}>Selecionar todos</button><button type="button" onClick={() => onChange([])}>Limpar seleção</button></div><div className="settings-user-list">{users.map((user) => <label key={user.id} className="settings-user-item"><input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => toggle(user.id)} />{user.photoUrl ? <img src={user.photoUrl} alt="" loading="lazy" decoding="async" /> : <span className="settings-user-item__avatar">{user.name.slice(0, 2).toUpperCase()}</span>}<span><strong>{user.name}</strong><small>{user.email}</small></span></label>)}{!users.length && <p className="empty-state">Nenhum usuário ativo encontrado.</p>}</div></div>;
}

function AdminSettings() {
  const [activeTab, setActiveTab] = useState("general");
  const [poolEnabled, setPoolEnabled] = useState(true);
  const [powerBiEnabled, setPowerBiEnabled] = useState(true);
  const [powerBiUrl, setPowerBiUrl] = useState("");
  const [powerBiRefreshIntervalSeconds, setPowerBiRefreshIntervalSeconds] = useState(300);
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [formsUserIds, setFormsUserIds] = useState([]);
  const [purchaseUserIds, setPurchaseUserIds] = useState([]);
  const [purchaseSignatureThresholdInput, setPurchaseSignatureThresholdInput] = useState("0,00");
  const [purchaseSignatureLabel, setPurchaseSignatureLabel] = useState("");
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [showFormsUserSelector, setShowFormsUserSelector] = useState(true);
  const [showPurchaseUserSelector, setShowPurchaseUserSelector] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [powerBiMessage, setPowerBiMessage] = useState("");
  const [formsMessage, setFormsMessage] = useState("");
  const [purchasesMessage, setPurchasesMessage] = useState("");

  useEffect(() => {
    Promise.all([api.get("/knowledge/pool-settings"), api.get("/admin/power-bi-settings"), api.get("/admin/forms-settings"), api.get("/admin/purchase-settings"), api.get("/admin/users")])
      .then(([poolResponse, powerBiResponse, formsResponse, purchaseResponse, usersResponse]) => {
        setPoolEnabled(poolResponse.data.poolEnabled); setPowerBiEnabled(powerBiResponse.data.enabled); setPowerBiUrl(powerBiResponse.data.url); setPowerBiRefreshIntervalSeconds(powerBiResponse.data.refreshIntervalSeconds ?? 300); setSelectedUserIds(powerBiResponse.data.userIds); setFormsUserIds(formsResponse.data.userIds); setPurchaseUserIds(purchaseResponse.data.userIds || []); setPurchaseSignatureThresholdInput(formatMoneyInput(purchaseResponse.data.signatureThresholdCents)); setPurchaseSignatureLabel(purchaseResponse.data.signatureLabel || ""); setUsers(usersResponse.data.filter((user) => user.active));
      }).catch(() => setMessage("Não foi possível carregar as configurações.")).finally(() => setLoading(false));
  }, []);

  const handlePoolToggle = async (event) => {
    const nextValue = event.target.checked; setPoolEnabled(nextValue); setSaving(true); setMessage("");
    try { const res = await api.put("/admin/pool-settings", { poolEnabled: nextValue }); setPoolEnabled(res.data.poolEnabled); window.dispatchEvent(new CustomEvent("pool-settings-updated", { detail: { poolEnabled: res.data.poolEnabled } })); setMessage("Configuração salva com sucesso."); }
    catch (error) { setPoolEnabled(!nextValue); setMessage(error.response?.data?.error || "Não foi possível salvar a configuração."); }
    finally { setSaving(false); }
  };

  const handlePowerBiSave = async (event) => {
    event.preventDefault(); setSaving(true); setPowerBiMessage("");
    try { const res = await api.put("/admin/power-bi-settings", { enabled: powerBiEnabled, url: powerBiUrl, refreshIntervalSeconds: Number(powerBiRefreshIntervalSeconds), userIds: selectedUserIds }); setPowerBiEnabled(res.data.enabled); setPowerBiUrl(res.data.url); setPowerBiRefreshIntervalSeconds(res.data.refreshIntervalSeconds); setSelectedUserIds(res.data.userIds); window.dispatchEvent(new CustomEvent("power-bi-settings-updated", { detail: { enabled: res.data.enabled } })); setPowerBiMessage("Configuração do Power BI salva com sucesso."); }
    catch (error) { setPowerBiMessage(error.response?.data?.error || "Não foi possível salvar a configuração do Power BI."); }
    finally { setSaving(false); }
  };

  const handleFormsSave = async (event) => {
    event.preventDefault(); setSaving(true); setFormsMessage("");
    try { const res = await api.put("/admin/forms-settings", { userIds: formsUserIds }); setFormsUserIds(res.data.userIds); window.dispatchEvent(new CustomEvent("forms-settings-updated")); setFormsMessage("Acessos de Formulários salvos com sucesso."); }
    catch (error) { setFormsMessage(error.response?.data?.error || "Não foi possível salvar os acessos de Formulários."); }
    finally { setSaving(false); }
  };

  const handlePurchasesSave = async (event) => {
    event.preventDefault(); setPurchasesMessage("");
    const signatureThresholdCents = parseMoneyToCents(purchaseSignatureThresholdInput);
    const signatureLabel = purchaseSignatureLabel.trim();
    if (signatureThresholdCents === null) { setPurchasesMessage("Informe um valor mínimo válido."); return; }
    if (signatureThresholdCents > 0 && !signatureLabel) { setPurchasesMessage("Informe quem deve assinar os pedidos que atingirem o valor mínimo."); return; }
    setSaving(true);
    try { const res = await api.put("/admin/purchase-settings", { signatureThresholdCents, signatureLabel, userIds: purchaseUserIds }); setPurchaseSignatureThresholdInput(formatMoneyInput(res.data.signatureThresholdCents)); setPurchaseSignatureLabel(res.data.signatureLabel); setPurchaseUserIds(res.data.userIds || []); window.dispatchEvent(new CustomEvent("purchase-settings-updated")); setPurchasesMessage("Configuração de compras salva com sucesso."); }
    catch (error) { setPurchasesMessage(error.response?.data?.error || "Não foi possível salvar a configuração de compras."); }
    finally { setSaving(false); }
  };

  const activeUsersWithoutAdmins = users.filter((user) => user.role !== "admin");
  const activeCreators = users.filter((user) => user.role === "creator");
  const tabs = [["general", "Geral"], ["forms", "Formulários"], ["purchases", "Compras"], ["sac", "SAC"], ["browninho", "Browninho"]];
  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tabs.findIndex(([value]) => value === activeTab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex][0]);
    window.requestAnimationFrame(() => document.getElementById(`settings-tab-${tabs[nextIndex][0]}`)?.focus());
  };
  return <section className="page-stack settings-page">
    <div className="section-heading section-heading--split"><div><span className="eyebrow">Administração</span><h1>Configurações</h1><p className="section-copy">Controle os recursos disponíveis para os colaboradores.</p></div><Link to="/admin/dashboard" className="button button--ghost">Voltar ao painel</Link></div>
    <div className="settings-tabs" role="tablist" aria-label="Áreas de configuração" onKeyDown={handleTabKeyDown}>{tabs.map(([value, label]) => <button key={value} id={`settings-tab-${value}`} type="button" role="tab" aria-selected={activeTab === value} aria-controls="settings-active-panel" tabIndex={activeTab === value ? 0 : -1} className={activeTab === value ? "active" : ""} onClick={() => setActiveTab(value)}>{label}</button>)}</div>
    <div id="settings-active-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>

    {activeTab === "general" && <div className="settings-tab-content">
      <section className="surface-card settings-panel"><div className="settings-panel__heading"><img src="/icon-ranking.svg" alt="" /><div><h2>Bolão da Copa</h2><p>Controle a exibição do ranking e gerencie seus participantes.</p></div></div><label className="settings-toggle"><input type="checkbox" checked={poolEnabled} disabled={loading || saving} onChange={handlePoolToggle} /><span className="settings-toggle__control" aria-hidden="true" /><span><strong>Habilitar bolão copa</strong><small>{poolEnabled ? "O ranking está disponível no menu lateral." : "O ranking está oculto para os colaboradores."}</small></span></label><div className="settings-panel__actions"><Link to="/admin/bolao" className="button">Configurar participantes</Link></div>{message && <SystemNotification variant={message.toLowerCase().includes("sucesso") ? "success" : "error"}>{message}</SystemNotification>}</section>
      <form className="surface-card settings-panel" onSubmit={handlePowerBiSave}><div className="settings-panel__heading"><img src="/icon-power-bi.svg" alt="" /><div><h2>Power BI</h2><p>Defina o relatório, a atualização automática e quem poderá acessá-lo.</p></div></div><label className="settings-toggle"><input type="checkbox" checked={powerBiEnabled} disabled={loading || saving} onChange={(event) => setPowerBiEnabled(event.target.checked)} /><span className="settings-toggle__control" aria-hidden="true" /><span><strong>Habilitar Power BI</strong><small>{powerBiEnabled ? "O BI ficará disponível para os usuários selecionados." : "O BI ficará oculto para todos os colaboradores."}</small></span></label><label className="settings-field"><span>Link do Power BI</span><input type="url" value={powerBiUrl} onChange={(event) => setPowerBiUrl(event.target.value)} placeholder="https://app.powerbi.com/view?..." required /></label><label className="settings-field"><span>Periodicidade da atualização (segundos)</span><input type="number" min="10" max="86400" step="1" value={powerBiRefreshIntervalSeconds} onChange={(event) => setPowerBiRefreshIntervalSeconds(event.target.value)} required /><small>Informe um número inteiro entre 10 segundos e 24 horas. O padrão é 300 segundos.</small></label><div className="settings-access"><div><strong>Usuários com acesso</strong><span>{selectedUserIds.length} selecionados</span></div><button type="button" className="button button--ghost" onClick={() => setShowUserSelector((value) => !value)}>{showUserSelector ? "Fechar seleção" : "Selecionar usuários"}</button></div>{showUserSelector && <UserSelector users={users} selectedIds={selectedUserIds} onChange={setSelectedUserIds} />}<div className="settings-panel__actions"><button type="submit" className="button" disabled={loading || saving}>{saving ? "Salvando..." : "Salvar configurações do BI"}</button></div>{powerBiMessage && <SystemNotification variant={powerBiMessage.toLowerCase().includes("sucesso") ? "success" : "error"}>{powerBiMessage}</SystemNotification>}</form>
    </div>}

    {activeTab === "forms" && <form className="surface-card settings-panel settings-tab-content" onSubmit={handleFormsSave}><div className="settings-panel__heading"><img src="/icon-forms.svg" alt="" /><div><h2>Formulários</h2><p>Escolha quais usuários poderão acessar modelos autorizados, preenchimentos e observações.</p></div></div><div className="settings-access"><div><strong>Usuários com acesso</strong><span>{formsUserIds.length} selecionados</span><small>Administradores sempre possuem acesso.</small></div><button type="button" className="button button--ghost" onClick={() => setShowFormsUserSelector((value) => !value)}>{showFormsUserSelector ? "Fechar seleção" : "Selecionar usuários"}</button></div>{showFormsUserSelector && <UserSelector users={activeUsersWithoutAdmins} selectedIds={formsUserIds} onChange={setFormsUserIds} />}<div className="settings-panel__actions"><button type="submit" className="button" disabled={loading || saving}>{saving ? "Salvando..." : "Salvar acessos de Formulários"}</button></div>{formsMessage && <SystemNotification variant={formsMessage.toLowerCase().includes("sucesso") ? "success" : "error"}>{formsMessage}</SystemNotification>}</form>}
    {activeTab === "purchases" && <form className="surface-card settings-panel settings-tab-content" onSubmit={handlePurchasesSave}><div className="settings-panel__heading"><img src="/icon-operacao.svg" alt="" /><div><h2>Compras</h2><p>Defina compradores autorizados e quando o Romaneio deve incluir uma assinatura adicional.</p></div></div><div className="settings-access"><div><strong>Compradores autorizados</strong><span>{purchaseUserIds.length} selecionado{purchaseUserIds.length === 1 ? "" : "s"}</span><small>Somente usuários com perfil Criador podem ser compradores. Administradores sempre possuem acesso.</small></div><button type="button" className="button button--ghost" onClick={() => setShowPurchaseUserSelector((value) => !value)}>{showPurchaseUserSelector ? "Fechar seleção" : "Selecionar compradores"}</button></div>{showPurchaseUserSelector && <UserSelector users={activeCreators} selectedIds={purchaseUserIds} onChange={setPurchaseUserIds} />}<div className="settings-purchase-grid"><label className="settings-field"><span>Valor mínimo do pedido</span><div className="settings-money-input"><span>R$</span><input inputMode="decimal" value={purchaseSignatureThresholdInput} onChange={(event) => setPurchaseSignatureThresholdInput(event.target.value)} placeholder="0,00" required /></div><small>Pedidos a partir deste valor exigirão a assinatura. Use 0,00 para desativar.</small></label><label className="settings-field"><span>Identificação da assinatura</span><input type="text" maxLength="80" value={purchaseSignatureLabel} onChange={(event) => setPurchaseSignatureLabel(event.target.value)} placeholder="Ex.: Gerente Financeiro" /><small>Este texto será exibido abaixo da linha de assinatura no Romaneio.</small></label></div><div className="settings-panel__actions"><button type="submit" className="button" disabled={loading || saving}>{saving ? "Salvando..." : "Salvar configurações de compras"}</button></div>{purchasesMessage && <SystemNotification variant={purchasesMessage.toLowerCase().includes("sucesso") ? "success" : "error"}>{purchasesMessage}</SystemNotification>}</form>}
    {activeTab === "browninho" && <BrowninhoSettings />}
    {activeTab === "sac" && <SacSettings />}
    </div>
  </section>;
}

export default AdminSettings;
