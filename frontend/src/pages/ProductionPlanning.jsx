import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ProductionProgressBar from "../components/ProductionProgressBar";
import api from "../services/api";

let xlsxLibraryPromise;

function loadXlsxLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);

  if (!xlsxLibraryPromise) {
    xlsxLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/xlsx.full.min.js";
      script.async = true;
      script.onload = () => window.XLSX
        ? resolve(window.XLSX)
        : reject(new Error("Biblioteca de planilhas indisponível."));
      script.onerror = () => reject(new Error("Não foi possível carregar a biblioteca de planilhas."));
      document.body.appendChild(script);
    });
  }

  return xlsxLibraryPromise;
}

function toSpreadsheetNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "loja";
}

function getCurrentMonthKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCurrentMonthRange() {
  const month = getCurrentMonthKey();
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatPeriodBoundary(value, fallback) {
  return value ? formatDate(value) : fallback;
}

function openDatePicker(inputRef) {
  const input = inputRef.current;
  if (!input) return;

  input.focus();
  if (typeof input.showPicker === "function") {
    input.showPicker();
  }
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getStatusLabel(status) {
  if (status === "finalizado") return "Finalizado";
  if (status === "em_producao") return "Em produção";
  return "Não iniciado";
}

function getStockStatusLabel(status) {
  if (status === "not_found") return "Sem registro (saldo zero)";
  if (status === "duplicate") return "Duplicado";
  if (status === "unavailable") return "Indisponível";
  return "Disponível";
}

function getConsolidatedProducts(productionDay) {
  const productMap = new Map();

  Object.values(productionDay.stores).forEach((storeProduction) => {
    storeProduction.products.forEach((product) => {
      const currentProduct = productMap.get(product.code) || {
        code: product.code,
        name: product.name,
        suggestion: 0,
      };

      currentProduct.suggestion += Number(product.suggestion || 0);
      productMap.set(product.code, currentProduct);
    });
  });

  return Array.from(productMap.values());
}

function getDispatchProgress(productionDay) {
  const storeProducts = Object.entries(productionDay.stores).flatMap(([storeName, storeProduction]) =>
    storeProduction.products.map((product) => ({ storeName, productCode: product.code }))
  );
  const producedCount = storeProducts.reduce((count, item) => {
    const dispatchItem = getDispatchItem(productionDay, item.storeName, item.productCode);
    return count + (dispatchItem?.status === "complete" || dispatchItem?.status === "incomplete" ? 1 : 0);
  }, 0);
  const totalProducts = storeProducts.length;
  const percentage = totalProducts
    ? Math.round((producedCount / totalProducts) * 1000) / 10
    : 0;

  return { producedCount, totalProducts, percentage };
}

function getDispatchItem(productionDay, storeName, productCode) {
  const dispatchItem = productionDay.dispatchItems?.[storeName]?.[productCode];
  if (dispatchItem) return dispatchItem;
  return productionDay.producedItems?.[productCode]
    ? { status: "complete", actualQuantity: null, justification: "" }
    : null;
}

function getActualProducedQuantity(product, dispatchItem) {
  if (dispatchItem?.status === "complete") {
    return toSpreadsheetNumber(product.suggestion);
  }
  if (dispatchItem?.status === "incomplete") {
    return toSpreadsheetNumber(dispatchItem.actualQuantity);
  }
  return null;
}

function ProductionPlanning() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canAccessSettings = hasRole(["admin"]);
  const [productionDays, setProductionDays] = useState([]);
  const [planningLoading, setPlanningLoading] = useState(true);
  const [planningError, setPlanningError] = useState("");
  const [periodSearch, setPeriodSearch] = useState({ startDate: "", endDate: "" });
  const [appliedPeriodSearch, setAppliedPeriodSearch] = useState({ startDate: "", endDate: "" });
  const [viewingDay, setViewingDay] = useState(null);
  const [modalMode, setModalMode] = useState("view");
  const [activeView, setActiveView] = useState("consolidado");
  const [incompleteItem, setIncompleteItem] = useState(null);
  const [incompleteQuantity, setIncompleteQuantity] = useState("");
  const [incompleteJustification, setIncompleteJustification] = useState("");
  const [incompleteError, setIncompleteError] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const startDateInputRef = useRef(null);
  const endDateInputRef = useRef(null);
  const selectedStoreProduction = viewingDay?.stores?.[activeView];
  const isDispatchMode = modalMode === "dispatch";
  const isFinalized = viewingDay?.status === "finalizado";
  const showDispatchColumns = isDispatchMode || isFinalized;
  const consolidatedProducts = useMemo(
    () => (viewingDay ? getConsolidatedProducts(viewingDay) : []),
    [viewingDay]
  );
  const dispatchProgress = useMemo(
    () => (viewingDay ? getDispatchProgress(viewingDay) : { producedCount: 0, totalProducts: 0, percentage: 0 }),
    [viewingDay]
  );
  const visibleProductionDays = productionDays;
  const productionCountLabel = `${visibleProductionDays.length} ${
    visibleProductionDays.length === 1 ? "dia planejado" : "dias planejados"
  }`;
  const hasPeriodSearch = Boolean(appliedPeriodSearch.startDate || appliedPeriodSearch.endDate);
  const hasDraftPeriodSearch = Boolean(periodSearch.startDate || periodSearch.endDate);
  const filterDescription = hasPeriodSearch
    ? `Producoes de ${formatPeriodBoundary(appliedPeriodSearch.startDate, "inicio")} a ${formatPeriodBoundary(appliedPeriodSearch.endDate, "fim")}`
    : "Producoes do mes atual";

  const loadProductionDays = async (period = getCurrentMonthRange()) => {
    setPlanningLoading(true);
    setPlanningError("");
    try {
      const response = await api.get("/admin/production-planning", { params: period });
      setProductionDays(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setProductionDays([]);
      setPlanningError(error.response?.data?.error || "Não foi possível carregar os planejamentos.");
    } finally {
      setPlanningLoading(false);
    }
  };

  useEffect(() => {
    loadProductionDays();
  }, []);

  const applyUpdatedDay = (updatedDay) => {
    setProductionDays((currentDays) => currentDays.map((day) =>
      day.day === updatedDay.day ? updatedDay : day
    ));
    setViewingDay(updatedDay);
  };

  const openViewModal = (productionDay) => {
    setViewingDay(productionDay);
    setModalMode("view");
    setActiveView("consolidado");
  };

  const openDispatchModal = (productionDay) => {
    setViewingDay(productionDay);
    setModalMode("dispatch");
    setActiveView("consolidado");
  };

  const closeModal = () => {
    setViewingDay(null);
    setIncompleteItem(null);
    setExportError("");
  };

  const handleSearchPeriod = () => {
    setAppliedPeriodSearch(periodSearch);
    loadProductionDays(periodSearch);
  };

  const handleClearSearch = () => {
    const emptyPeriod = { startDate: "", endDate: "" };
    setPeriodSearch(emptyPeriod);
    setAppliedPeriodSearch(emptyPeriod);
    loadProductionDays();
  };

  const handleStatusAction = async () => {
    if (!viewingDay) return;
    const nextStatus = viewingDay.status === "nao_iniciado" ? "em_producao" : "nao_iniciado";
    setPlanningError("");
    try {
      const response = await api.patch(`/admin/production-planning/${viewingDay.day}/status`, { status: nextStatus });
      applyUpdatedDay(response.data);
    } catch (error) {
      setPlanningError(error.response?.data?.error || "Não foi possível alterar o status.");
    }
  };

  const saveDispatchItem = async (storeName, productCode, dispatchItem) => {
    if (!viewingDay || isFinalized) return;
    setPlanningError("");
    try {
      const response = await api.put(`/admin/production-planning/${viewingDay.day}/dispatch`, {
        storeName,
        productCode,
        dispatchItem,
      });
      applyUpdatedDay(response.data);
      return true;
    } catch (error) {
      setPlanningError(error.response?.data?.error || "Não foi possível atualizar o despacho.");
      return false;
    }
  };

  const handleCompleteItemChange = (storeName, productCode, checked) => {
    saveDispatchItem(
      storeName,
      productCode,
      checked ? { status: "complete", actualQuantity: null, justification: "" } : null
    );
  };

  const handleIncompleteItemChange = (storeName, product, checked) => {
    if (!checked) {
      saveDispatchItem(storeName, product.code, null);
      return;
    }

    const currentItem = getDispatchItem(viewingDay, storeName, product.code);
    setIncompleteItem({ storeName, product });
    setIncompleteQuantity(currentItem?.status === "incomplete" ? String(currentItem.actualQuantity ?? "") : "");
    setIncompleteJustification(currentItem?.status === "incomplete" ? currentItem.justification || "" : "");
    setIncompleteError("");
  };

  const closeIncompleteModal = () => {
    setIncompleteItem(null);
    setIncompleteQuantity("");
    setIncompleteJustification("");
    setIncompleteError("");
  };

  const handleIncompleteSubmit = async (event) => {
    event.preventDefault();
    if (!incompleteItem) return;

    const actualQuantity = Number(incompleteQuantity);
    const justification = incompleteJustification.trim();
    if (!Number.isInteger(actualQuantity) || actualQuantity < 0) {
      setIncompleteError("Informe uma quantidade real válida.");
      return;
    }
    if (!justification) {
      setIncompleteError("Informe a justificativa da divergência.");
      return;
    }

    const saved = await saveDispatchItem(incompleteItem.storeName, incompleteItem.product.code, {
      status: "incomplete",
      actualQuantity,
      justification,
    });
    if (saved) closeIncompleteModal();
  };

  const handleExportActiveView = async () => {
    if (!viewingDay || exportLoading) return;

    setExportLoading(true);
    setExportError("");
    try {
      const XLSX = await loadXlsxLibrary();
      const storesToExport = activeView === "consolidado"
        ? Object.entries(viewingDay.stores)
        : [[activeView, viewingDay.stores[activeView]]];
      const includeDispatchData = isDispatchMode || isFinalized;
      const headers = [
        "Loja",
        "Dia de produção",
        "Início do período comparado",
        "Fim do período comparado",
        "Código",
        "Nome",
        "Média vendida",
        "Quantidade em estoque",
        "Data-base do estoque",
        "Status do estoque",
        "% de aumento",
        "Fixos",
        "Encomendas",
        "Total adicional",
        "Quantidade a produzir",
        ...(includeDispatchData
          ? ["Produzido", "Divergente", "Real produzido", "Justificativa"]
          : []),
      ];
      const rows = storesToExport.flatMap(([storeName, storeProduction]) =>
        (storeProduction?.products || []).map((product) => {
          const dispatchItem = getDispatchItem(viewingDay, storeName, product.code);
          const isComplete = dispatchItem?.status === "complete";
          const isIncomplete = dispatchItem?.status === "incomplete";

          return [
            storeName,
            viewingDay.day,
            viewingDay.comparisonStartDate,
            viewingDay.comparisonEndDate,
            product.code,
            product.name,
            toSpreadsheetNumber(product.averageSold),
            toSpreadsheetNumber(product.stockQuantity),
            product.stockDate || "",
            getStockStatusLabel(product.stockStatus),
            toSpreadsheetNumber(product.increasePercent),
            toSpreadsheetNumber(product.fixedQuantity || 0),
            toSpreadsheetNumber(product.orderQuantity || 0),
            toSpreadsheetNumber((Number(product.fixedQuantity) || 0) + (Number(product.orderQuantity) || 0)),
            toSpreadsheetNumber(product.suggestion),
            ...(includeDispatchData
              ? [
                  isComplete ? "Sim" : "Não",
                  isIncomplete ? "Sim" : "Não",
                  getActualProducedQuantity(product, dispatchItem),
                  isIncomplete ? dispatchItem.justification || "" : "",
                ]
              : []),
          ];
        })
      );
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      worksheet["!cols"] = [
        { wch: 32 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 16 },
        { wch: 38 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 24 },
        { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
        ...(includeDispatchData
          ? [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 48 }]
          : []),
      ];
      const workbook = XLSX.utils.book_new();
      const contextName = activeView === "consolidado" ? "Consolidado" : activeView;
      const sheetName = contextName.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Planejamento";
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(
        workbook,
        `planejamento-${viewingDay.day}-${activeView === "consolidado" ? "consolidado" : slugify(activeView)}.xlsx`
      );
    } catch (error) {
      setExportError(error.message || "Não foi possível exportar a planilha.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleFinalizeDispatch = async () => {
    if (!viewingDay || isFinalized || dispatchProgress.percentage < 100) return;
    const confirmed = window.confirm("Confirma a finalização da expedição deste dia de produção?");
    if (!confirmed) return;

    setPlanningError("");
    try {
      const response = await api.post(`/admin/production-planning/${viewingDay.day}/finalize`);
      applyUpdatedDay(response.data);
    } catch (error) {
      setPlanningError(error.response?.data?.error || "Não foi possível finalizar a expedição.");
    }
  };

  return (
    <section className="production-planning-page">
      <div className="production-planning-toolbar">
        <div>
          <h1>Planejamento de Produção</h1>
          <p className="section-copy">
            {productionCountLabel} - {filterDescription}
          </p>
        </div>
        <div className="production-toolbar-actions">
          {canAccessSettings && (
            <Link
              to="/planejamento-producao/configuracoes"
              className="production-settings-link"
              aria-label="Configurações do planejamento"
              title="Configurações"
            >
              <img src="/icon-configuracoes-planejamento.svg" alt="" aria-hidden="true" />
            </Link>
          )}
          <Link to="/planejamento-producao/nova" className="button">
            Novo planejamento de produção
          </Link>
        </div>
      </div>

      <div className="production-date-filter" aria-label="Filtro de producoes por periodo">
        <label onClick={() => openDatePicker(startDateInputRef)}>
          <span>Inicio do periodo</span>
          <input
            ref={startDateInputRef}
            type="date"
            value={periodSearch.startDate}
            onChange={(event) =>
              setPeriodSearch((currentPeriod) => ({ ...currentPeriod, startDate: event.target.value }))
            }
          />
        </label>
        <label onClick={() => openDatePicker(endDateInputRef)}>
          <span>Fim do periodo</span>
          <input
            ref={endDateInputRef}
            type="date"
            value={periodSearch.endDate}
            onChange={(event) =>
              setPeriodSearch((currentPeriod) => ({ ...currentPeriod, endDate: event.target.value }))
            }
          />
        </label>
        <button type="button" className="button" onClick={handleSearchPeriod}>
          Pesquisar
        </button>
        {(hasDraftPeriodSearch || hasPeriodSearch) && (
          <button
            type="button"
            className="button button--ghost"
            onClick={handleClearSearch}
          >
            Limpar busca
          </button>
        )}
      </div>

      {planningError && <p className="form-message form-message--error" role="alert">{planningError}</p>}

      <div className="production-table-shell">
        <table className="production-table">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Período comparado</th>
              <th>Criado em</th>
              <th>Status</th>
              <th>% produção</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visibleProductionDays.map((production) => (
              <tr key={production.day}>
                <td>{formatDate(production.day)}</td>
                <td>
                  {formatDate(production.comparisonStartDate)} a {formatDate(production.comparisonEndDate)}
                </td>
                <td>{formatDateTime(production.createdAt)}</td>
                <td>
                  <span className={`production-status production-status--${production.status}`}>
                    {getStatusLabel(production.status)}
                  </span>
                </td>
                <td>
                  {(() => {
                    const progress = getDispatchProgress(production);
                    return (
                      <ProductionProgressBar
                        value={progress.percentage}
                        title={`${progress.producedCount} de ${progress.totalProducts} itens produzidos`}
                        ariaLabel={`Produção concluída: ${progress.percentage}%`}
                      />
                    );
                  })()}
                </td>
                <td>
                  <div className="production-table-actions">
                    <button
                      type="button"
                      aria-label="Visualizar planejamento"
                      title="Visualizar"
                      onClick={() => openViewModal(production)}
                    >
                      <span aria-hidden="true">◉</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Editar planejamento"
                      title={production.status === "finalizado" ? "Planejamentos finalizados não podem ser editados" : "Editar"}
                      onClick={() => navigate(`/planejamento-producao/${production.day}/editar`)}
                      disabled={production.status === "finalizado"}
                    >
                      <span aria-hidden="true">✎</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Despachar planejamento"
                      title="Despachar"
                      onClick={() => openDispatchModal(production)}
                    >
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {planningLoading && <p className="empty-state production-empty-state">Carregando planejamentos...</p>}
        {!planningLoading && !visibleProductionDays.length && (
          <p className="empty-state production-empty-state">
            {hasPeriodSearch ? "Nenhum dia planejado para este periodo." : "Nenhum dia planejado no mes atual."}
          </p>
        )}
      </div>

      {viewingDay && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card modal-card--wide production-view-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <div className="production-view-title-row">
                  <h3>{isDispatchMode ? "Expedição" : "Produção"} de {formatDate(viewingDay.day)}</h3>
                  <span className={`production-status production-status--${viewingDay.status}`}>
                    {getStatusLabel(viewingDay.status)}
                  </span>
                </div>
                <p className="section-copy">
                  Comparado com {formatDate(viewingDay.comparisonStartDate)} a {formatDate(viewingDay.comparisonEndDate)}
                </p>
              </div>
              <div className="production-view-header-actions">
                {isDispatchMode && !isFinalized && (
                  <button
                    type="button"
                    className="production-dispatch-action"
                    onClick={handleFinalizeDispatch}
                    disabled={dispatchProgress.percentage < 100}
                    title={dispatchProgress.percentage < 100
                      ? "Marque todos os produtos antes de finalizar a expedição."
                      : "Finalizar expedição"}
                  >
                    Finalizar Expedição
                  </button>
                )}
                {!isDispatchMode && viewingDay.status !== "finalizado" && (
                  <button
                    type="button"
                    className={`production-status-action production-status-action--${viewingDay.status}`}
                    onClick={handleStatusAction}
                  >
                    <span aria-hidden="true">{viewingDay.status === "nao_iniciado" ? "▶" : "⏸"}</span>
                    {viewingDay.status === "nao_iniciado" ? "Iniciar" : "Pausar"}
                  </button>
                )}
                <button type="button" onClick={closeModal}>
                  x
                </button>
              </div>
            </div>

            <div className="production-view-tabs-toolbar">
              <div className="production-view-tabs">
                <button
                  type="button"
                  className={activeView === "consolidado" ? "production-view-tabs__item--active" : ""}
                  onClick={() => {
                    setActiveView("consolidado");
                    setExportError("");
                  }}
                >
                  Consolidado
                </button>
                {Object.keys(viewingDay.stores).map((storeName) => (
                  <button
                    key={storeName}
                    type="button"
                    className={activeView === storeName ? "production-view-tabs__item--active" : ""}
                    onClick={() => {
                      setActiveView(storeName);
                      setExportError("");
                    }}
                  >
                    {storeName}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="production-export-button"
                onClick={handleExportActiveView}
                disabled={exportLoading}
                title={`Exportar ${activeView === "consolidado" ? "consolidado" : activeView} para Excel`}
              >
                {exportLoading ? "Exportando..." : "Exportar Excel"}
              </button>
              {exportError && <p className="production-export-error" role="alert">{exportError}</p>}
            </div>

            <div className="production-table-shell">
              {activeView === "consolidado" ? (
                <table className="production-table production-products-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>Total a produzir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedProducts.map((product) => (
                      <tr key={product.code}>
                        <td>{product.code}</td>
                        <td>{product.name}</td>
                        <td>{product.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={`production-table production-products-table ${showDispatchColumns ? "production-dispatch-store-table" : ""}`}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>A produzir</th>
                      {showDispatchColumns && <th>Real produzido</th>}
                      {showDispatchColumns && <th>Produzido</th>}
                      {showDispatchColumns && <th>Divergente</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStoreProduction?.products.map((product) => {
                      const dispatchItem = getDispatchItem(viewingDay, activeView, product.code);
                      const isComplete = dispatchItem?.status === "complete";
                      const isIncomplete = dispatchItem?.status === "incomplete";
                      const actualProducedQuantity = getActualProducedQuantity(product, dispatchItem);

                      return (
                        <tr key={product.code}>
                          <td data-label="Código">{product.code}</td>
                          <td data-label="Nome">{product.name}</td>
                          <td data-label="A produzir">{product.suggestion}</td>
                          {showDispatchColumns && (
                            <td data-label="Real produzido">{actualProducedQuantity ?? ""}</td>
                          )}
                          {showDispatchColumns && (
                            <td data-label="Produzido">
                              <label className="production-produced-check" title="Produzido">
                                <input
                                  type="checkbox"
                                  aria-label={`Marcar ${product.name} como produzido`}
                                  checked={isComplete}
                                  disabled={!isDispatchMode || isFinalized}
                                  onChange={(event) => handleCompleteItemChange(activeView, product.code, event.target.checked)}
                                />
                              </label>
                            </td>
                          )}
                          {showDispatchColumns && (
                            <td data-label="Divergente">
                              <div className="production-incomplete-cell">
                                <label className="production-produced-check" title="Divergente">
                                  <input
                                    type="checkbox"
                                    aria-label={`Marcar ${product.name} como divergente`}
                                    checked={isIncomplete}
                                    disabled={!isDispatchMode || isFinalized}
                                    onChange={(event) => handleIncompleteItemChange(activeView, product, event.target.checked)}
                                  />
                                </label>
                                {isFinalized && isIncomplete && (
                                  <span
                                    className="production-incomplete-warning"
                                    title={dispatchItem.justification}
                                    aria-label={`Justificativa: ${dispatchItem.justification}`}
                                    tabIndex="0"
                                  >
                                    {"\u26A0"}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {incompleteItem && (
        <div className="modal-backdrop production-incomplete-backdrop" onClick={closeIncompleteModal}>
          <form
            className="modal-card production-incomplete-modal"
            onSubmit={handleIncompleteSubmit}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <div>
                <h3>Produção divergente</h3>
                <p className="section-copy">
                  {incompleteItem.product.name} - {incompleteItem.storeName}
                </p>
              </div>
              <button type="button" onClick={closeIncompleteModal} aria-label="Fechar">
                x
              </button>
            </div>

            <label className="production-incomplete-field">
              <span>Quantidade real produzida</span>
              <input
                type="number"
                min="0"
                step="1"
                value={incompleteQuantity}
                onChange={(event) => setIncompleteQuantity(event.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="production-incomplete-field">
              <span>Justificativa</span>
              <textarea
                rows="4"
                value={incompleteJustification}
                onChange={(event) => setIncompleteJustification(event.target.value)}
                required
              />
            </label>

            {incompleteError && <p className="production-incomplete-error">{incompleteError}</p>}

            <div className="production-incomplete-actions">
              <button type="button" className="button button--ghost" onClick={closeIncompleteModal}>
                Cancelar
              </button>
              <button type="submit" className="button button--primary">
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default ProductionPlanning;
