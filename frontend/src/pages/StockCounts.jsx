import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import SystemNotification from "../components/SystemNotification";

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function StockCounts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSelectStore = ["admin", "production_manager"].includes(user?.role);
  const [counts, setCounts] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [countsResponse, storesResponse] = await Promise.all([
        api.get("/stock-counts"),
        api.get("/stock-counts/stores"),
      ]);
      setCounts(countsResponse.data || []);
      setStores(storesResponse.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível carregar as contagens.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const startCount = async (productionStoreId) => {
    setStarting(true);
    setError("");
    try {
      const response = await api.post("/stock-counts", {
        productionStoreId: productionStoreId ? Number(productionStoreId) : undefined,
      });
      navigate(`/contagem-estoque/${response.data.id}`);
    } catch (err) {
      const countId = err.response?.data?.countId;
      setError(err.response?.data?.error || "Não foi possível iniciar a contagem.");
      setShowStorePicker(false);
      if (countId) await loadData();
    } finally {
      setStarting(false);
    }
  };

  const handleNewCount = () => {
    if (canSelectStore) {
      setSelectedStoreId(stores.length === 1 ? String(stores[0].id) : "");
      setShowStorePicker(true);
      return;
    }
    startCount();
  };

  return (
    <section className="page-stack stock-counts-page">
      <header className="stock-count-page-header">
        <div>
          <p className="eyebrow">Operação</p>
          <h1>Contagem de Estoque</h1>
          <p className="section-copy">Acompanhe as contagens diárias e consulte o histórico finalizado.</p>
        </div>
        <button type="button" className="button" onClick={handleNewCount} disabled={starting || !stores.length}>
          {starting ? "Iniciando..." : "Nova contagem"}
        </button>
      </header>

      {error && <SystemNotification variant="error">{error}</SystemNotification>}

      <div className="stock-count-table-wrap">
        {loading ? (
          <div className="stock-count-empty">Carregando contagens...</div>
        ) : counts.length ? (
          <table className="stock-count-table">
            <thead>
              <tr>
                <th>Loja</th>
                <th>QNT. Produtos</th>
                <th>Data do estoque</th>
                <th>Horário</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((count) => (
                <tr key={count.id}>
                  <td data-label="Loja"><strong>{count.storeName}</strong></td>
                  <td data-label="QNT. Produtos">{count.productCount}</td>
                  <td data-label="Data do estoque">{formatDate(count.stockDate)}</td>
                  <td data-label="Horário">{formatTime(count.createdAt)}</td>
                  <td data-label="Status">
                    <span className={`stock-count-status stock-count-status--${count.status}`}>
                      {count.status === "finalized" ? "Finalizada" : "Rascunho"}
                    </span>
                  </td>
                  <td data-label="Ações">
                    <button
                      type="button"
                      className="button button--ghost stock-count-action"
                      onClick={() => navigate(`/contagem-estoque/${count.id}`)}
                    >
                      {count.status === "finalized" ? "Visualizar" : "Continuar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="stock-count-empty">Nenhuma contagem registrada.</div>
        )}
      </div>

      {showStorePicker && (
        <div className="modal-backdrop" onClick={() => !starting && setShowStorePicker(false)}>
          <div className="modal-card stock-count-store-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <h3>Selecionar loja</h3>
                <p className="section-copy">A contagem será criada para a data de hoje.</p>
              </div>
              <button type="button" onClick={() => setShowStorePicker(false)} disabled={starting}>x</button>
            </div>
            <label className="stock-count-store-field">
              <span>Loja</span>
              <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} autoFocus>
                <option value="">Selecione</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.displayName}</option>)}
              </select>
            </label>
            <div className="form-actions">
              <button type="button" className="button button--ghost" onClick={() => setShowStorePicker(false)} disabled={starting}>
                Cancelar
              </button>
              <button type="button" className="button" onClick={() => startCount(selectedStoreId)} disabled={!selectedStoreId || starting}>
                {starting ? "Iniciando..." : "Iniciar contagem"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default StockCounts;
