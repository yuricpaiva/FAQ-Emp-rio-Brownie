import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

const settingsTabs = [
  {
    id: "general",
    label: "Geral",
    title: "Configurações gerais",
    items: [
      "Definir regras padrão de sugestão de produção.",
      "Controlar parâmetros gerais por período.",
      "Preparar integrações futuras com estoque e vendas.",
    ],
  },
  {
    id: "products",
    label: "Produtos vendidos",
    title: "Produtos vendidos",
  },
  {
    id: "conversions",
    label: "Conversões",
    title: "Conversões",
    items: [
      "Configurar equivalências entre unidade e embalagem.",
      "Definir conversões para produção e expedição.",
      "Preparar cálculo consolidado por produto.",
    ],
  },
  {
    id: "connections",
    label: "Conexões",
    title: "Conexões externas",
    description: "Configure e valide os bancos usados pelo planejamento de produção.",
  },
];

const weekdays = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const headerAliases = {
  codigo: "code",
  "codigo do produto": "code",
  nome: "name",
};

let xlsxLibraryPromise;

function loadXlsxLibrary() {
  if (window.XLSX) {
    return Promise.resolve(window.XLSX);
  }

  if (!xlsxLibraryPromise) {
    xlsxLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/xlsx.full.min.js";
      script.async = true;
      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
        } else {
          reject(new Error("Biblioteca de planilhas indisponivel."));
        }
      };
      script.onerror = () => reject(new Error("Nao foi possivel carregar a biblioteca de planilhas."));
      document.body.appendChild(script);
    });
  }

  return xlsxLibraryPromise;
}

function normalizeHeader(value) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function parseProductsWorkbook(buffer) {
  const XLSX = await loadXlsxLibrary();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  if (!worksheet) return [];

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => headerAliases[normalizeHeader(String(header || ""))]);
  const codeIndex = headers.indexOf("code");
  const nameIndex = headers.indexOf("name");

  if (codeIndex === -1 || nameIndex === -1) return [];

  return rows.slice(1).map((columns) => {
    return {
      code: String(columns[codeIndex] || "").trim(),
      name: String(columns[nameIndex] || "").trim(),
    };
  }).filter((product) => product.code);
}

async function downloadWorkbookTemplate() {
  const XLSX = await loadXlsxLibrary();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["codigo", "nome"],
    ["BRW-001", "Brownie tradicional vendido"],
  ]);
  const workbook = XLSX.utils.book_new();

  worksheet["!cols"] = [{ wch: 18 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos vendidos");
  XLSX.writeFile(workbook, "modelo-produtos-vendidos.xlsx");
}

function createProductId() {
  return `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConversionId() {
  return `conversion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDecimalInput(value) {
  return value.replace(",", ".").replace(/[^\d.]/g, "");
}

function toDecimalNumber(value) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : NaN;
}

function formatConversionFactor(value) {
  const factor = toDecimalNumber(value);

  if (!Number.isFinite(factor) || factor <= 0) {
    return "-";
  }

  return Number(factor.toFixed(4)).toLocaleString("pt-BR", {
    maximumFractionDigits: 4,
  });
}

function ProductsSettings() {
  const fileInputRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    api.get("/admin/production-products")
      .then((response) => {
        if (!active) return;
        setProducts(response.data.map((product) => ({
          id: product.id || createProductId(),
          code: product.code,
          name: product.name,
        })));
      })
      .catch(() => {
        if (active) {
          setMessage("Não foi possível carregar os produtos.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const addProduct = () => {
    setProducts((currentProducts) => [
      ...currentProducts,
      { id: createProductId(), code: "", name: "" },
    ]);
  };

  const updateProduct = (id, field, value) => {
    setProducts((currentProducts) => currentProducts.map((product) =>
      product.id === id ? { ...product, [field]: value } : product
    ));
  };

  const removeProduct = (id) => {
    setProducts((currentProducts) => currentProducts.filter((product) => product.id !== id));
  };

  const importProducts = (importedProducts) => {
    setMessage("");
    setProducts((currentProducts) => {
      const productsByCode = new Map(
        currentProducts.map((product) => [product.code.trim(), product])
      );

      importedProducts.forEach((importedProduct) => {
        const code = importedProduct.code.trim();
        if (!code) return;

        const currentProduct = productsByCode.get(code);
        productsByCode.set(code, {
          id: currentProduct?.id || createProductId(),
          code,
          name: importedProduct.name,
        });
      });

      return Array.from(productsByCode.values());
    });
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const importedProducts = await parseProductsWorkbook(reader.result);
        importProducts(importedProducts);
      } catch (error) {
        setMessage(error.message || "Nao foi possivel importar a planilha.");
      }
      event.target.value = "";
    };
    reader.onerror = () => {
      setMessage("Nao foi possivel ler a planilha.");
      event.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };

  const normalizeProductsToSave = () => {
    const productsByCode = new Map();

    products.forEach((product) => {
      const code = product.code.trim();
      const name = product.name.trim();
      if (!code) return;

      productsByCode.set(code, { code, name });
    });

    return Array.from(productsByCode.values());
  };

  const saveProducts = async () => {
    const productsToSave = normalizeProductsToSave();

    if (!productsToSave.length) {
      setMessage("Informe pelo menos um produto com código.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await api.put("/admin/production-products", { products: productsToSave });
      setProducts(response.data.map((product) => ({
        id: product.id || createProductId(),
        code: product.code,
        name: product.name,
      })));
      setMessage("Produtos salvos com sucesso.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Não foi possível salvar os produtos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="production-products-settings-toolbar">
        <div className="production-products-settings-toolbar__left">
          <button
            type="button"
            className="production-settings-icon-button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Importar planilha de produtos vendidos"
            title="Importar planilha"
          >
            <img src="/icon-importar-planilha.svg" alt="" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="production-settings-icon-button"
            onClick={() => {
              downloadWorkbookTemplate().catch(() => {
                setMessage("Nao foi possivel baixar a planilha modelo.");
              });
            }}
            aria-label="Baixar planilha modelo de produtos vendidos"
            title="Baixar modelo"
          >
            <img src="/icon-baixar-modelo.svg" alt="" aria-hidden="true" />
          </button>
        </div>
        <div className="production-products-settings-toolbar__right">
          <button type="button" className="button production-products-settings-add" onClick={addProduct}>
            Adicionar produto
          </button>
          <button type="button" className="button" onClick={saveProducts} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="production-settings-file-input"
          onChange={handleFileChange}
        />
      </div>

      {message && (
        <p className={`form-message ${message.toLowerCase().includes("sucesso") ? "form-message--success" : "form-message--error"}`}>
          {message}
        </p>
      )}

      <div className="production-table-shell">
        <table className="production-table production-products-settings-table">
          <thead>
            <tr>
              <th>Código do produto vendido</th>
              <th>Nome do produto vendido</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {!loading && products.map((product) => (
              <tr key={product.id}>
                <td>
                  <input
                    type="text"
                    value={product.code}
                    onChange={(event) => updateProduct(product.id, "code", event.target.value)}
                    placeholder="BRW-001"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={product.name}
                    onChange={(event) => updateProduct(product.id, "name", event.target.value)}
                    placeholder="Nome do produto"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="production-settings-remove-button"
                    onClick={() => removeProduct(product.id)}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <p className="empty-state production-empty-state">Carregando produtos...</p>
        )}

        {!loading && !products.length && (
          <p className="empty-state production-empty-state">Nenhum produto cadastrado.</p>
        )}
      </div>
    </>
  );
}

function GeneralSettings() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingStores, setSavingStores] = useState(false);
  const [savingRoutes, setSavingRoutes] = useState(false);
  const [foundCount, setFoundCount] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    api.get("/admin/production-stores?includeInactive=true")
      .then((response) => {
        if (!active) return;
        setStores(response.data);
      })
      .catch(() => {
        if (active) {
          setMessage("Não foi possível carregar as lojas.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const syncStores = async () => {
    setSyncing(true);
    setMessage("");

    try {
      const response = await api.post("/admin/production-stores/sync");
      setStores(response.data.stores);
      setFoundCount(response.data.foundCount);
      setMessage("Lojas buscadas com sucesso.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Não foi possível buscar as lojas existentes.");
    } finally {
      setSyncing(false);
    }
  };

  const updateStoreDisplayName = (storeId, displayName) => {
    setStores((currentStores) => currentStores.map((store) =>
      store.id === storeId ? { ...store, displayName } : store
    ));
  };

  const toggleStoreActive = (storeId) => {
    setStores((currentStores) => currentStores.map((store) =>
      store.id === storeId ? { ...store, active: !store.active } : store
    ));
  };

  const toggleRouteWeekday = (storeId, weekday) => {
    setStores((currentStores) => currentStores.map((store) => {
      if (store.id !== storeId) return store;

      const currentWeekdays = store.routeWeekdays || [];
      const nextWeekdays = currentWeekdays.includes(weekday)
        ? currentWeekdays.filter((item) => item !== weekday)
        : [...currentWeekdays, weekday].sort((a, b) => a - b);

      return { ...store, routeWeekdays: nextWeekdays };
    }));
  };

  const saveStores = async () => {
    setSavingStores(true);
    setMessage("");

    try {
      const response = await api.put("/admin/production-stores", {
        stores: stores.map((store) => ({
          id: store.id,
          displayName: store.displayName,
          active: store.active,
        })),
      });
      setStores(response.data);
      setMessage("Lojas salvas com sucesso.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Não foi possível salvar as lojas.");
    } finally {
      setSavingStores(false);
    }
  };

  const saveRoutes = async () => {
    setSavingRoutes(true);
    setMessage("");

    try {
      const response = await api.put("/admin/production-store-routes", {
        routes: stores.map((store) => ({
          storeId: store.id,
          weekdays: store.routeWeekdays || [],
        })),
      });
      setStores(response.data);
      setMessage("Rotas salvas com sucesso.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Não foi possível salvar as rotas.");
    } finally {
      setSavingRoutes(false);
    }
  };

  return (
    <div className="production-general-settings">
      <section className="production-settings-subsection">
        <div className="production-settings-subsection__header">
          <div>
            <h3>Cadastro de loja</h3>
            <p>Busque as lojas existentes e defina o nome usado nas telas do planejamento.</p>
          </div>
          <div className="production-products-settings-toolbar__right">
            <button type="button" className="button button--ghost" onClick={syncStores} disabled={syncing}>
              {syncing ? "Buscando..." : "Buscar lojas existentes"}
            </button>
            <button type="button" className="button" onClick={saveStores} disabled={loading || savingStores || !stores.length}>
              {savingStores ? "Salvando..." : "Salvar lojas"}
            </button>
          </div>
        </div>

        {foundCount !== null && (
          <p className="section-copy">{foundCount} lojas encontradas no banco.</p>
        )}

        <div className="production-table-shell">
          <table className="production-table production-products-settings-table">
            <thead>
              <tr>
                <th>Loja encontrada</th>
                <th>Status</th>
                <th>Nome de Exibição</th>
              </tr>
            </thead>
            <tbody>
              {!loading && stores.map((store) => (
                <tr key={store.id} className={!store.active ? "production-store-row--inactive" : ""}>
                  <td>
                    <span>{store.sourceName}</span>
                    {!store.active && (
                      <span className="production-store-inactive-label">Inativa</span>
                    )}
                  </td>
                  <td>
                    <label className="production-store-active-check">
                      <input
                        type="checkbox"
                        checked={Boolean(store.active)}
                        onChange={() => toggleStoreActive(store.id)}
                      />
                      <span>{store.active ? "Ativa" : "Inativa"}</span>
                    </label>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={store.displayName}
                      onChange={(event) => updateStoreDisplayName(store.id, event.target.value)}
                      placeholder="Nome de exibição"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <p className="empty-state production-empty-state">Carregando lojas...</p>
          )}

          {!loading && !stores.length && (
            <p className="empty-state production-empty-state">Clique em Buscar lojas existentes para iniciar o cadastro.</p>
          )}
        </div>
      </section>

      <section className="production-settings-subsection">
        <div className="production-settings-subsection__header">
          <div>
            <h3>Cadastro de rotas</h3>
            <p>Defina em quais dias da semana cada loja recebe mercadoria.</p>
          </div>
          <button type="button" className="button" onClick={saveRoutes} disabled={loading || savingRoutes || !stores.length}>
            {savingRoutes ? "Salvando..." : "Salvar rotas"}
          </button>
        </div>

        <div className="production-table-shell">
          <table className="production-table production-store-routes-table">
            <thead>
              <tr>
                <th>Loja</th>
                {weekdays.map((weekday) => (
                  <th key={weekday.value}>{weekday.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && stores.map((store) => (
                <tr key={store.id} className={!store.active ? "production-store-row--inactive" : ""}>
                  <td>
                    {store.displayName}
                    {!store.active && (
                      <span className="production-store-inactive-label">Inativa</span>
                    )}
                  </td>
                  {weekdays.map((weekday) => (
                    <td key={weekday.value}>
                      <input
                        type="checkbox"
                        checked={(store.routeWeekdays || []).includes(weekday.value)}
                        onChange={() => toggleRouteWeekday(store.id, weekday.value)}
                        aria-label={`${store.displayName} recebe mercadoria em ${weekday.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <p className="empty-state production-empty-state">Carregando rotas...</p>
          )}

          {!loading && !stores.length && (
            <p className="empty-state production-empty-state">Cadastre lojas antes de configurar rotas.</p>
          )}
        </div>
      </section>

      {message && (
        <p className={`form-message ${message.toLowerCase().includes("sucesso") ? "form-message--success" : "form-message--error"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

function ConversionsSettings() {
  const [products, setProducts] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      api.get("/admin/production-products"),
      api.get("/admin/production-conversions"),
    ])
      .then(([productsResponse, conversionsResponse]) => {
        if (!active) return;
        setProducts(productsResponse.data);
        setConversions(conversionsResponse.data.map((conversion) => ({
          id: conversion.id || createConversionId(),
          sourceProductId: String(conversion.sourceProductId),
          conversionCode: conversion.conversionCode,
          conversionName: conversion.conversionName,
          conversionFactor: String(conversion.conversionFactor),
        })));
      })
      .catch(() => {
        if (active) {
          setMessage("Não foi possível carregar as conversões.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const addConversion = () => {
    setConversions((currentConversions) => [
      ...currentConversions,
      {
        id: createConversionId(),
        sourceProductId: "",
        conversionCode: "",
        conversionName: "",
        conversionFactor: "",
      },
    ]);
  };

  const updateConversion = (id, field, value) => {
    const nextValue = field === "conversionFactor" ? normalizeDecimalInput(value) : value;
    setConversions((currentConversions) => currentConversions.map((conversion) =>
      conversion.id === id ? { ...conversion, [field]: nextValue } : conversion
    ));
  };

  const removeConversion = (id) => {
    setConversions((currentConversions) => currentConversions.filter((conversion) => conversion.id !== id));
  };

  const normalizeConversionsToSave = () => {
    const conversionsBySource = new Map();

    conversions.forEach((conversion) => {
      const sourceProductId = Number(conversion.sourceProductId);
      const conversionCode = conversion.conversionCode.trim();
      const conversionName = conversion.conversionName.trim();
      const conversionFactor = toDecimalNumber(conversion.conversionFactor);

      if (!sourceProductId && !conversionCode && !conversionName && !conversion.conversionFactor) return;
      if (!Number.isInteger(sourceProductId) || !conversionCode || !conversionName) return;
      if (conversionFactor <= 0) return;

      conversionsBySource.set(sourceProductId, {
        sourceProductId,
        conversionCode,
        conversionName,
        conversionFactor,
      });
    });

    return Array.from(conversionsBySource.values());
  };

  const saveConversions = async () => {
    const conversionsToSave = normalizeConversionsToSave();

    if (conversions.length && !conversionsToSave.length) {
      setMessage("Informe produto vendido, código, nome e fator de conversão para salvar.");
      return;
    }

    if (conversions.length !== conversionsToSave.length) {
      setMessage("Revise as linhas incompletas ou duplicadas antes de salvar.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await api.put("/admin/production-conversions", { conversions: conversionsToSave });
      setConversions(response.data.map((conversion) => ({
        id: conversion.id || createConversionId(),
        sourceProductId: String(conversion.sourceProductId),
        conversionCode: conversion.conversionCode,
        conversionName: conversion.conversionName,
        conversionFactor: String(conversion.conversionFactor),
      })));
      setMessage("Conversões salvas com sucesso.");
    } catch (error) {
      setMessage(error.response?.data?.error || "Não foi possível salvar as conversões.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="production-products-settings-toolbar">
        <div className="production-products-settings-toolbar__right">
          <button type="button" className="button production-products-settings-add" onClick={addConversion} disabled={loading || !products.length}>
            Adicionar conversão
          </button>
          <button type="button" className="button" onClick={saveConversions} disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {message && (
        <p className={`form-message ${message.toLowerCase().includes("sucesso") ? "form-message--success" : "form-message--error"}`}>
          {message}
        </p>
      )}

      <div className="production-table-shell">
        <table className="production-table production-products-settings-table production-conversions-settings-table">
          <thead>
            <tr>
              <th>Produto vendido</th>
              <th>Cdg produto de conversão</th>
              <th>Nome produto de conversão</th>
              <th>Fator de conversão</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {!loading && conversions.map((conversion) => (
              <tr key={conversion.id}>
                <td>
                  <select
                    value={conversion.sourceProductId}
                    onChange={(event) => updateConversion(conversion.id, "sourceProductId", event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code} - {product.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={conversion.conversionCode}
                    onChange={(event) => updateConversion(conversion.id, "conversionCode", event.target.value)}
                    placeholder="FATIA-001"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={conversion.conversionName}
                    onChange={(event) => updateConversion(conversion.id, "conversionName", event.target.value)}
                    placeholder="Fatia de bolo de ninho"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={conversion.conversionFactor}
                    onChange={(event) => updateConversion(conversion.id, "conversionFactor", event.target.value)}
                    placeholder="8"
                  />
                  <small className="production-conversion-factor-preview">
                    1 vendido = {formatConversionFactor(conversion.conversionFactor)} convertido
                  </small>
                </td>
                <td>
                  <button
                    type="button"
                    className="production-settings-remove-button"
                    onClick={() => removeConversion(conversion.id)}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <p className="empty-state production-empty-state">Carregando conversões...</p>
        )}

        {!loading && !products.length && (
          <p className="empty-state production-empty-state">Cadastre produtos antes de configurar conversões.</p>
        )}

        {!loading && products.length > 0 && !conversions.length && (
          <p className="empty-state production-empty-state">Nenhuma conversão cadastrada.</p>
        )}
      </div>
    </>
  );
}

const emptyConnectionState = {
  configuration: null,
  password: "",
  validationToken: "",
  testResult: null,
  message: "",
  testing: false,
  saving: false,
};

function formatConnectionDate(value) {
  if (!value) return "Sem dados";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function ConnectionLog({ result }) {
  if (!result) return null;

  return (
    <div className={`database-connection-log database-connection-log--${result.success ? "success" : "error"}`} aria-live="polite">
      <div className="database-connection-log__summary">
        <strong>{result.success ? "Conexão validada" : "Falha na conexão"}</strong>
        <span>Data consultada: {formatConnectionDate(result.businessDate)}</span>
        {result.success && (
          <>
            <span>Data mais recente: {formatConnectionDate(result.latestDate)}</span>
            <span>Registros na data: {result.todayCount ?? 0}</span>
          </>
        )}
      </div>
      <ol className="database-connection-log__steps">
        {(result.logs || []).map((entry, index) => (
          <li key={`${entry.name}-${entry.timestamp}-${index}`} className={`database-connection-log__step database-connection-log__step--${entry.status}`}>
            <span className="database-connection-log__indicator" aria-hidden="true" />
            <div>
              <strong>{entry.name}</strong>
              <span>{entry.message}</span>
            </div>
            <time dateTime={entry.timestamp}>{entry.durationMs} ms</time>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DatabaseConnectionSection({ system, title, description, state, setState }) {
  const configuration = state.configuration || {};
  const isEverest = system === "everest";

  const updateField = (field, value) => {
    setState((current) => ({
      ...current,
      configuration: { ...current.configuration, [field]: value },
      validationToken: "",
      testResult: null,
      message: current.testResult ? "Os campos mudaram. Teste a conexão novamente." : "",
    }));
  };

  const updatePassword = (value) => {
    setState((current) => ({
      ...current,
      password: value,
      validationToken: "",
      testResult: null,
      message: current.testResult ? "Os campos mudaram. Teste a conexão novamente." : "",
    }));
  };

  const payload = () => ({ ...configuration, password: state.password });

  const testConnection = async () => {
    setState((current) => ({ ...current, testing: true, validationToken: "", testResult: null, message: "" }));
    try {
      const response = await api.post(`/admin/database-connections/${system}/test`, payload());
      setState((current) => ({
        ...current,
        testing: false,
        testResult: response.data,
        validationToken: response.data.validationToken || "",
        message: response.data.success ? "Teste concluído com sucesso." : response.data.error?.message || "A conexão não pôde ser validada.",
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        testing: false,
        testResult: null,
        message: error.response?.data?.error || "Não foi possível executar o teste.",
      }));
    }
  };

  const saveConnection = async () => {
    setState((current) => ({ ...current, saving: true, message: "" }));
    try {
      const response = await api.put(`/admin/database-connections/${system}`, {
        configuration: payload(),
        validationToken: state.validationToken,
      });
      setState((current) => ({
        ...current,
        configuration: response.data.configuration,
        password: "",
        validationToken: "",
        saving: false,
        message: response.data.message,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        saving: false,
        validationToken: "",
        message: error.response?.data?.error || "Não foi possível salvar a configuração.",
      }));
    }
  };

  return (
    <section className="database-connection-section">
      <div className="production-settings-subsection__header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {isEverest && (
          <label className="database-connection-enabled">
            <input
              type="checkbox"
              checked={Boolean(configuration.enabled)}
              onChange={(event) => updateField("enabled", event.target.checked)}
            />
            <span>Conexão ativa</span>
          </label>
        )}
      </div>

      <div className="database-connection-fields">
        <label>
          <span>Host</span>
          <input type="text" value={configuration.host || ""} onChange={(event) => updateField("host", event.target.value)} />
        </label>
        <label>
          <span>Porta</span>
          <input type="number" min="1" max="65535" value={configuration.port || ""} onChange={(event) => updateField("port", event.target.value)} />
        </label>
        <label>
          <span>Database</span>
          <input type="text" value={configuration.database || ""} onChange={(event) => updateField("database", event.target.value)} />
        </label>
        <label>
          <span>Usuário</span>
          <input type="text" autoComplete="username" value={configuration.user || ""} onChange={(event) => updateField("user", event.target.value)} />
        </label>
        <label>
          <span>Nova senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={state.password}
            placeholder={configuration.passwordConfigured ? "Senha configurada" : "Senha não configurada"}
            onChange={(event) => updatePassword(event.target.value)}
          />
        </label>
        {isEverest && (
          <>
            <label>
              <span>Charset</span>
              <input type="text" value={configuration.charset || ""} onChange={(event) => updateField("charset", event.target.value)} />
            </label>
            <label>
              <span>Timezone</span>
              <input type="text" value={configuration.timezone || ""} onChange={(event) => updateField("timezone", event.target.value)} />
            </label>
          </>
        )}
      </div>

      <div className="database-connection-actions">
        <button type="button" className="button button--ghost" onClick={testConnection} disabled={state.testing || state.saving}>
          {state.testing ? "Testando..." : "Testar conexão"}
        </button>
        <button type="button" className="button" onClick={saveConnection} disabled={!state.validationToken || state.testing || state.saving}>
          {state.saving ? "Salvando..." : "Salvar configuração"}
        </button>
      </div>

      <ConnectionLog result={state.testResult} />
      {state.message && (
        <p className={`form-message ${state.validationToken || state.message.toLowerCase().includes("sucesso") ? "form-message--success" : "form-message--error"}`}>
          {state.message}
        </p>
      )}
    </section>
  );
}

function ConnectionsSettings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dw, setDw] = useState(emptyConnectionState);
  const [everest, setEverest] = useState(emptyConnectionState);

  useEffect(() => {
    let active = true;
    api.get("/admin/database-connections")
      .then((response) => {
        if (!active) return;
        setDw({ ...emptyConnectionState, configuration: response.data.dw });
        setEverest({ ...emptyConnectionState, configuration: response.data.everest });
      })
      .catch((error) => {
        if (active) setLoadError(error.response?.data?.error || "Não foi possível carregar as conexões.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <p className="empty-state production-empty-state">Carregando conexões...</p>;
  if (loadError) return <p className="form-message form-message--error">{loadError}</p>;

  return (
    <div className="database-connections-settings">
      <DatabaseConnectionSection
        system="dw"
        title="Banco 3S - Média de venda"
        description="PostgreSQL usado para consultar vendas e produtos."
        state={dw}
        setState={setDw}
      />
      <DatabaseConnectionSection
        system="everest"
        title="Everest - Estoque"
        description="MySQL usado para consultar o saldo de estoque atual."
        state={everest}
        setState={setEverest}
      />
    </div>
  );
}

function ProductionPlanningSettings() {
  const [activeTab, setActiveTab] = useState(settingsTabs[0].id);
  const currentTab = settingsTabs.find((tab) => tab.id === activeTab) || settingsTabs[0];

  return (
    <section className="production-planning-page production-settings-page">
      <div className="production-planning-toolbar">
        <div>
          <h1>Configurações do Planejamento</h1>
        </div>
        <Link to="/planejamento-producao" className="button button--ghost">
          Voltar ao planejamento
        </Link>
      </div>

      <div className="production-settings-tabs" role="tablist" aria-label="Configurações do planejamento">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "production-settings-tabs__item--active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="production-settings-panel">
        <div>
          <h2>{currentTab.title}</h2>
          <p>{currentTab.description}</p>
        </div>

        {activeTab === "general" ? (
          <GeneralSettings />
        ) : activeTab === "products" ? (
          <ProductsSettings />
        ) : activeTab === "conversions" ? (
          <ConversionsSettings />
        ) : activeTab === "connections" ? (
          <ConnectionsSettings />
        ) : (
          <div className="production-settings-placeholder">
            {currentTab.items.map((item) => (
              <div key={item}>
                <span aria-hidden="true">•</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export default ProductionPlanningSettings;
