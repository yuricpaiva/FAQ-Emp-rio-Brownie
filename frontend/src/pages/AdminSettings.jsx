import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import SystemNotification from "../components/SystemNotification";

function AdminSettings() {
  const [poolEnabled, setPoolEnabled] = useState(true);
  const [powerBiEnabled, setPowerBiEnabled] = useState(true);
  const [powerBiUrl, setPowerBiUrl] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [powerBiMessage, setPowerBiMessage] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/knowledge/pool-settings"),
      api.get("/admin/power-bi-settings"),
      api.get("/admin/users"),
    ])
      .then(([poolResponse, powerBiResponse, usersResponse]) => {
        setPoolEnabled(poolResponse.data.poolEnabled);
        setPowerBiEnabled(powerBiResponse.data.enabled);
        setPowerBiUrl(powerBiResponse.data.url);
        setSelectedUserIds(powerBiResponse.data.userIds);
        setUsers(usersResponse.data.filter((user) => user.active));
      })
      .catch(() => setMessage("Não foi possível carregar as configurações."))
      .finally(() => setLoading(false));
  }, []);

  const handlePoolToggle = async (event) => {
    const nextValue = event.target.checked;
    setPoolEnabled(nextValue);
    setSaving(true);
    setMessage("");

    try {
      const res = await api.put("/admin/pool-settings", { poolEnabled: nextValue });
      setPoolEnabled(res.data.poolEnabled);
      window.dispatchEvent(
        new CustomEvent("pool-settings-updated", {
          detail: { poolEnabled: res.data.poolEnabled },
        })
      );
      setMessage("Configuração salva com sucesso.");
    } catch (err) {
      setPoolEnabled(!nextValue);
      setMessage(err.response?.data?.error || "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  };

  const handleUserToggle = (userId) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const handlePowerBiSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setPowerBiMessage("");

    try {
      const res = await api.put("/admin/power-bi-settings", {
        enabled: powerBiEnabled,
        url: powerBiUrl,
        userIds: selectedUserIds,
      });
      setPowerBiEnabled(res.data.enabled);
      setPowerBiUrl(res.data.url);
      setSelectedUserIds(res.data.userIds);
      window.dispatchEvent(
        new CustomEvent("power-bi-settings-updated", {
          detail: { enabled: res.data.enabled },
        })
      );
      setPowerBiMessage("Configuração do Power BI salva com sucesso.");
    } catch (err) {
      setPowerBiMessage(err.response?.data?.error || "Não foi possível salvar a configuração do Power BI.");
    } finally {
      setSaving(false);
    }
  };

  const messageIsSuccess = message.toLowerCase().includes("sucesso");
  const powerBiMessageIsSuccess = powerBiMessage.toLowerCase().includes("sucesso");

  return (
    <section className="page-stack settings-page">
      <div className="section-heading section-heading--split">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Configurações</h1>
          <p className="section-copy">Controle os recursos disponíveis para os colaboradores.</p>
        </div>
        <Link to="/admin/dashboard" className="button button--ghost">Voltar ao painel</Link>
      </div>

      <section className="surface-card settings-panel">
        <div className="settings-panel__heading">
          <img src="/icon-ranking.svg" alt="" />
          <div>
            <h2>Bolão da Copa</h2>
            <p>Controle a exibição do ranking e gerencie seus participantes.</p>
          </div>
        </div>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={poolEnabled}
            disabled={loading || saving}
            onChange={handlePoolToggle}
          />
          <span className="settings-toggle__control" aria-hidden="true" />
          <span>
            <strong>Habilitar bolão copa</strong>
            <small>
              {poolEnabled
                ? "O ranking está disponível no menu lateral."
                : "O ranking está oculto para os colaboradores."}
            </small>
          </span>
        </label>

        <div className="settings-panel__actions">
          <Link to="/admin/bolao" className="button">
            Configurar participantes
          </Link>
        </div>

        {message && (
          <SystemNotification variant={messageIsSuccess ? "success" : "error"}>{message}</SystemNotification>
        )}
      </section>

      <form className="surface-card settings-panel" onSubmit={handlePowerBiSave}>
        <div className="settings-panel__heading">
          <img src="/icon-power-bi.svg" alt="" />
          <div>
            <h2>Power BI</h2>
            <p>Defina o relatório e escolha quem poderá acessá-lo.</p>
          </div>
        </div>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={powerBiEnabled}
            disabled={loading || saving}
            onChange={(event) => setPowerBiEnabled(event.target.checked)}
          />
          <span className="settings-toggle__control" aria-hidden="true" />
          <span>
            <strong>Habilitar Power BI</strong>
            <small>
              {powerBiEnabled
                ? "O BI ficará disponível para os usuários selecionados."
                : "O BI ficará oculto para todos os colaboradores."}
            </small>
          </span>
        </label>

        <label className="settings-field">
          <span>Link do Power BI</span>
          <input
            type="url"
            value={powerBiUrl}
            onChange={(event) => setPowerBiUrl(event.target.value)}
            placeholder="https://app.powerbi.com/view?..."
            required
          />
        </label>

        <div className="settings-access">
          <div>
            <strong>Usuários com acesso</strong>
            <span>{selectedUserIds.length} selecionados</span>
          </div>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setShowUserSelector((value) => !value)}
          >
            {showUserSelector ? "Fechar seleção" : "Selecionar usuários"}
          </button>
        </div>

        {showUserSelector && (
          <div className="settings-user-selector">
            <div className="settings-user-selector__actions">
              <button type="button" onClick={() => setSelectedUserIds(users.map((user) => user.id))}>
                Selecionar todos
              </button>
              <button type="button" onClick={() => setSelectedUserIds([])}>
                Limpar seleção
              </button>
            </div>
            <div className="settings-user-list">
              {users.map((user) => (
                <label key={user.id} className="settings-user-item">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => handleUserToggle(user.id)}
                  />
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt="" />
                  ) : (
                    <span className="settings-user-item__avatar">
                      {user.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                </label>
              ))}
              {!users.length && <p className="empty-state">Nenhum usuário ativo encontrado.</p>}
            </div>
          </div>
        )}

        <div className="settings-panel__actions">
          <button type="submit" className="button" disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar configurações do BI"}
          </button>
        </div>

        {powerBiMessage && (
          <SystemNotification variant={powerBiMessageIsSuccess ? "success" : "error"}>
            {powerBiMessage}
          </SystemNotification>
        )}
      </form>
    </section>
  );
}

export default AdminSettings;
