import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { normalizeDecimalInput } from "../utils/decimalInput";
import { sortProductsByName } from "../utils/productSorting";

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function StockCountEntry() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [count, setCount] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCount, setSavingCount] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const valuesRef = useRef({});
  const inputRefs = useRef([]);
  const timersRef = useRef(new Map());
  const dirtyRef = useRef(new Set());
  const pendingRef = useRef(new Map());

  useEffect(() => {
    let active = true;
    api.get(`/stock-counts/${id}`)
      .then((response) => {
        if (!active) return;
        const sortedItems = sortProductsByName(response.data.items);
        const nextValues = Object.fromEntries(
          sortedItems.map((item) => [item.id, item.quantity === null ? "" : String(item.quantity)])
        );
        setCount({ ...response.data, items: sortedItems });
        setValues(nextValues);
        valuesRef.current = nextValues;
      })
      .catch((err) => active && setError(err.response?.data?.error || "Não foi possível carregar a contagem."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [id]);

  useEffect(() => {
    const warnUnsaved = (event) => {
      if (!dirtyRef.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);

  const saveItem = (itemId, explicitValue) => {
    const timer = timersRef.current.get(itemId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(itemId);
    const value = explicitValue ?? valuesRef.current[itemId] ?? "";
    const previous = pendingRef.current.get(itemId) || Promise.resolve();
    const request = previous.catch(() => {}).then(() => {
      setSavingCount((current) => current + 1);
      return api.patch(`/stock-counts/${id}/items/${itemId}`, {
        quantity: value === "" ? null : value,
      });
    })
      .then(() => {
        if ((valuesRef.current[itemId] ?? "") === value) dirtyRef.current.delete(itemId);
        setError("");
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Não foi possível salvar uma quantidade.");
        throw err;
      })
      .finally(() => {
        setSavingCount((current) => Math.max(0, current - 1));
        if (pendingRef.current.get(itemId) === request) pendingRef.current.delete(itemId);
      });
    pendingRef.current.set(itemId, request);
    return request;
  };

  const scheduleSave = (itemId) => {
    const previous = timersRef.current.get(itemId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => saveItem(itemId).catch(() => {}), 550);
    timersRef.current.set(itemId, timer);
  };

  const handleQuantityChange = (itemId, value) => {
    const normalizedValue = normalizeDecimalInput(value);
    if (normalizedValue === null) return;
    const next = { ...valuesRef.current, [itemId]: normalizedValue };
    valuesRef.current = next;
    setValues(next);
    dirtyRef.current.add(itemId);
    scheduleSave(itemId);
  };

  const flushAll = async () => {
    const dirtyIds = [...dirtyRef.current];
    await Promise.all(dirtyIds.map((itemId) => saveItem(itemId)));
    await Promise.all([...pendingRef.current.values()]);
  };

  const handleEnter = async (event, itemId, index) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    try {
      if (dirtyRef.current.has(itemId)) await saveItem(itemId);
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    } catch {
      inputRefs.current[index]?.focus();
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm("Finalizar esta contagem? Depois disso, ela não poderá ser alterada.")) return;
    setFinalizing(true);
    setError("");
    try {
      await flushAll();
      const response = await api.post(`/stock-counts/${id}/finalize`);
      const sortedItems = sortProductsByName(response.data.items);
      const nextValues = Object.fromEntries(sortedItems.map((item) => [item.id, String(item.quantity ?? 0)]));
      valuesRef.current = nextValues;
      setValues(nextValues);
      setCount({ ...response.data, items: sortedItems });
      dirtyRef.current.clear();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível finalizar a contagem.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <div className="stock-count-empty">Carregando contagem...</div>;
  if (!count) {
    return (
      <section className="page-stack">
        <p className="form-message form-message--error">{error}</p>
        <button type="button" className="button button--ghost" onClick={() => navigate("/contagem-estoque")}>Voltar</button>
      </section>
    );
  }

  const readonly = count.status === "finalized";

  return (
    <section className="page-stack stock-count-entry-page">
      <header className="stock-count-page-header">
        <div>
          <button type="button" className="stock-count-back" onClick={() => navigate("/contagem-estoque")} aria-label="Voltar">←</button>
          <p className="eyebrow">{readonly ? "Contagem finalizada" : "Contagem em andamento"}</p>
          <h1>{count.storeName}</h1>
          <p className="section-copy">Data do estoque: <strong>{formatDate(count.stockDate)}</strong></p>
        </div>
        {!readonly && <span className="stock-count-save-state">{savingCount ? "Salvando..." : "Alterações salvas"}</span>}
      </header>

      {error && <p className="form-message form-message--error">{error}</p>}

      <form onSubmit={(event) => event.preventDefault()} className="stock-count-entry-form">
        <div className="stock-count-table-wrap">
          <table className="stock-count-table stock-count-entry-table">
            <thead><tr><th>Código</th><th>Produto</th><th>Quantidade</th></tr></thead>
            <tbody>
              {count.items.map((item, index) => (
                <tr key={item.id}>
                  <td data-label="Código"><span className="stock-count-code">{item.code}</span></td>
                  <td data-label="Produto"><strong>{item.name}</strong></td>
                  <td data-label="Quantidade">
                    <input
                      ref={(element) => { inputRefs.current[index] = element; }}
                      className="stock-count-quantity"
                      type="text"
                      inputMode="decimal"
                      value={values[item.id] ?? ""}
                      onChange={(event) => handleQuantityChange(item.id, event.target.value)}
                      onBlur={() => dirtyRef.current.has(item.id) && saveItem(item.id).catch(() => {})}
                      onKeyDown={(event) => handleEnter(event, item.id, index)}
                      disabled={readonly || finalizing}
                      aria-label={`Quantidade de ${item.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readonly && (
          <div className="stock-count-final-actions">
            <span>{count.items.length} produtos nesta contagem</span>
            <button type="button" className="button" onClick={handleFinalize} disabled={finalizing}>
              {finalizing ? "Finalizando..." : "Finalizar contagem"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

export default StockCountEntry;
