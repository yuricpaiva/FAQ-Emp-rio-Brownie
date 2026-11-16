import { ArrowLeft, Check, Edit3, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import useUnsavedChanges from "../hooks/useUnsavedChanges";
import { createPurchaseOrder, getProductPurchaseHistory, getPurchaseOrder, searchProducts, searchSuppliers, updatePurchaseOrder } from "../services/purchaseOrderService";
import { calculateSubtotalCents, calculateTotals, formatCnpj, formatCurrency, formatDate, formatQuantity, isValidCnpj, normalizeCnpj, normalizeDecimal, parseMoneyToCents, validatePurchaseDraft } from "../utils/purchaseOrders";

const newAddition = () => ({ id: globalThis.crypto?.randomUUID?.() || `addition-${Date.now()}-${Math.random()}`, description: "", amountInput: "" });
const emptyProduct = { productId: "", quantity: "", priceInput: "" };
const supplierLabel = (supplier) => `${supplier.name} — ${supplier.cnpj}`;
const productLabel = (product) => `${product.code} — ${product.description}`;
const normalizeSearch = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const uniqueId = (prefix) => `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
const manualProductKey = (description, unitLabel) => `${normalizeSearch(description)}::${normalizeSearch(unitLabel)}`;

export default function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { confirm } = useSystemNotification();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplier, setSupplier] = useState(null);
  const [supplierListOpen, setSupplierListOpen] = useState(false);
  const [activeSupplierIndex, setActiveSupplierIndex] = useState(-1);
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productListOpen, setProductListOpen] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [manualProductDraft, setManualProductDraft] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [editingItemId, setEditingItemId] = useState(null);
  const [items, setItems] = useState([]);
  const [additions, setAdditions] = useState([newAddition()]);
  const [errors, setErrors] = useState({});
  const [productError, setProductError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadingOrder, setLoadingOrder] = useState(isEditing);
  const submissionLockRef = useRef(false);
  useUnsavedChanges(dirty && !saving);

  useEffect(() => {
    let current = true;
    Promise.all([searchSuppliers(), isEditing ? getPurchaseOrder(id) : Promise.resolve(null)])
      .then(([supplierOptions, order]) => {
        if (!current) return;
        setSuppliers(supplierOptions);
        if (!isEditing) return;
        if (!order) { setLoadError("Pedido não encontrado."); return; }
        if (order.status === "CANCELLED") { setLoadError("Pedidos cancelados não podem ser editados."); return; }
        const selectedSupplier = supplierOptions.find((item) => item.id === order.supplier.id) || order.supplier;
        setSupplier(selectedSupplier);
        setSupplierQuery(supplierLabel(selectedSupplier));
        setItems(order.items);
        setAdditions(order.additions.length ? order.additions.map((addition) => ({ ...addition, amountInput: (addition.amountCents / 100).toFixed(2).replace(".", ",") })) : [newAddition()]);
        setDirty(false);
      })
      .catch(() => setLoadError(isEditing ? "Não foi possível carregar o pedido para edição." : "Não foi possível carregar os fornecedores simulados."))
      .finally(() => { if (current) setLoadingOrder(false); });
    return () => { current = false; };
  }, [id, isEditing]);
  useEffect(() => {
    if (!supplier) { setProducts([]); return; }
    let current = true;
    searchProducts({ supplierId: supplier.id }).then((result) => { if (current) setProducts(result); }).catch(() => setLoadError("Não foi possível carregar os produtos simulados."));
    return () => { current = false; };
  }, [supplier]);

  const filteredSuppliers = useMemo(() => {
    const term = normalizeSearch(supplierQuery);
    if (!term || (supplier && supplierQuery === supplierLabel(supplier))) return suppliers;
    return suppliers.filter((item) => normalizeSearch(`${item.name} ${item.legalName} ${item.cnpj}`).includes(term));
  }, [supplierQuery, suppliers, supplier]);
  const supplierCnpjDigits = normalizeCnpj(supplierQuery);
  const hasExactEverestCnpj = suppliers.some((item) => normalizeCnpj(item.cnpj) === supplierCnpjDigits);
  const canUseManualSupplier = isValidCnpj(supplierCnpjDigits) && !hasExactEverestCnpj;
  const hasInvalidCompleteCnpj = supplierCnpjDigits.length === 14 && !isValidCnpj(supplierCnpjDigits);
  const filteredProducts = useMemo(() => {
    const term = normalizeSearch(productQuery);
    if (!term || (selectedProduct && productQuery === productLabel(selectedProduct))) return products;
    return products.filter((product) => normalizeSearch(`${product.code} ${product.description}`).includes(term));
  }, [productQuery, products, selectedProduct]);
  const canAddManualProduct = Boolean(productQuery.trim()) && filteredProducts.length === 0 && !manualProductDraft;
  const chosenProduct = selectedProduct || products.find((product) => product.id === productForm.productId) || null;
  const validAdditions = useMemo(() => additions.map((addition) => ({ ...addition, amountCents: parseMoneyToCents(addition.amountInput) || 0 })), [additions]);
  const totals = useMemo(() => calculateTotals(items, validAdditions), [items, validAdditions]);
  const touch = () => setDirty(true);

  useEffect(() => {
    if (!supplier?.id || !productForm.productId || manualProductDraft || chosenProduct?.productSource === "MANUAL") {
      setPurchaseHistory([]);
      setHistoryLoading(false);
      setHistoryError("");
      return undefined;
    }
    let current = true;
    setPurchaseHistory([]);
    setHistoryLoading(true);
    setHistoryError("");
    getProductPurchaseHistory({ supplierId: supplier.id, productId: productForm.productId, limit: 2 })
      .then((result) => { if (current) setPurchaseHistory(result); })
      .catch(() => { if (current) setHistoryError("Não foi possível consultar as compras anteriores."); })
      .finally(() => { if (current) setHistoryLoading(false); });
    return () => { current = false; };
  }, [supplier?.id, productForm.productId, manualProductDraft, chosenProduct?.productSource, historyReloadKey]);

  useEffect(() => {
    if (!supplierListOpen) { setActiveSupplierIndex(-1); return; }
    setActiveSupplierIndex(filteredSuppliers.length ? 0 : -1);
  }, [filteredSuppliers, supplierListOpen]);

  useEffect(() => {
    if (!productListOpen) { setActiveProductIndex(-1); return; }
    setActiveProductIndex(filteredProducts.length ? 0 : -1);
  }, [filteredProducts, productListOpen]);

  const chooseProduct = (product) => {
    setManualProductDraft(null);
    setSelectedProduct(product);
    setProductQuery(productLabel(product));
    setProductForm((current) => ({ ...current, productId: product.id }));
    setProductListOpen(false);
    setProductError("");
    touch();
  };

  const changeProductQuery = (value) => {
    setManualProductDraft(null);
    setProductQuery(value);
    setSelectedProduct(null);
    setProductForm((current) => ({ ...current, productId: "" }));
    setProductListOpen(true);
    setProductError("");
    touch();
  };

  const handleProductKeyDown = (event) => {
    if (event.key === "Escape") { setProductListOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!productListOpen) { setProductListOpen(true); return; }
      if (!filteredProducts.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveProductIndex((current) => (current + direction + filteredProducts.length) % filteredProducts.length);
      return;
    }
    if (event.key === "Enter" && productListOpen && activeProductIndex >= 0) {
      event.preventDefault();
      chooseProduct(filteredProducts[activeProductIndex]);
      return;
    }
    if (event.key === "Enter" && productListOpen && canAddManualProduct) {
      event.preventDefault();
      startManualProduct();
    }
  };

  const selectSupplier = async (next) => {
    if (supplier?.id === next?.id) return true;
    if (items.length) {
      const accepted = await confirm("Ao trocar o fornecedor, todos os produtos e acréscimos preenchidos serão removidos.", { title: "Trocar fornecedor?", confirmLabel: "Trocar e limpar" });
      if (!accepted) return false;
    }
    setSupplier(next); setItems([]); setAdditions([newAddition()]); setProductForm(emptyProduct); setSelectedProduct(null); setManualProductDraft(null); setProductListOpen(false); setEditingItemId(null); setProductQuery(""); setErrors({}); touch();
    return true;
  };

  const chooseSupplier = async (nextSupplier) => {
    const accepted = await selectSupplier(nextSupplier);
    if (!accepted) {
      if (supplier) setSupplierQuery(supplierLabel(supplier));
      setSupplierListOpen(false);
      return;
    }
    setSupplierQuery(supplierLabel(nextSupplier));
    setSupplierListOpen(false);
  };

  const chooseManualSupplier = async () => {
    if (!canUseManualSupplier) return;
    const cnpj = formatCnpj(supplierCnpjDigits);
    await chooseSupplier({ source: "MANUAL_CNPJ", id: `cnpj:${supplierCnpjDigits}`, everestId: "", name: "Fornecedor não cadastrado no Everest", legalName: "", cnpj });
  };

  const changeSupplierQuery = (value) => {
    setSupplierQuery(value);
    setSupplierListOpen(true);
    setErrors((current) => ({ ...current, supplier: undefined }));
  };

  const closeSupplierList = () => {
    setSupplierListOpen(false);
    if (supplier) setSupplierQuery(supplierLabel(supplier));
  };

  const handleSupplierKeyDown = (event) => {
    if (event.key === "Escape") { closeSupplierList(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!supplierListOpen) { setSupplierListOpen(true); return; }
      if (!filteredSuppliers.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSupplierIndex((current) => (current + direction + filteredSuppliers.length) % filteredSuppliers.length);
      return;
    }
    if (event.key === "Enter" && supplierListOpen && activeSupplierIndex >= 0) {
      event.preventDefault();
      chooseSupplier(filteredSuppliers[activeSupplierIndex]);
      return;
    }
    if (event.key === "Enter" && supplierListOpen && canUseManualSupplier) {
      event.preventDefault();
      chooseManualSupplier();
    }
  };

  const startManualProduct = () => {
    if (!productQuery.trim()) return;
    const productId = uniqueId("manual");
    setManualProductDraft({ productId, unitId: uniqueId("manual-unit"), description: productQuery.trim(), code: "", unitLabel: "" });
    setSelectedProduct(null);
    setProductForm((current) => ({ ...current, productId }));
    setProductListOpen(false);
    setProductError("");
    touch();
  };

  const cancelManualProduct = () => {
    setManualProductDraft(null);
    setProductForm(emptyProduct);
    setProductQuery("");
    setEditingItemId(null);
    setProductError("");
  };

  const useHistoricalValue = (unitPriceCents) => {
    setProductForm((current) => ({ ...current, priceInput: (unitPriceCents / 100).toFixed(2).replace(".", ",") }));
    setProductError("");
    touch();
  };

  const saveProduct = () => {
    setProductError("");
    const product = manualProductDraft ? {
      id: manualProductDraft.productId,
      productSource: "MANUAL",
      everestId: "",
      code: manualProductDraft.code.trim(),
      description: manualProductDraft.description.trim(),
      unit: { id: manualProductDraft.unitId, everestId: "", code: "", label: manualProductDraft.unitLabel.trim() }
    } : selectedProduct || products.find((item) => item.id === productForm.productId);
    const quantity = normalizeDecimal(productForm.quantity);
    const unitPriceCents = parseMoneyToCents(productForm.priceInput);
    if (!product) { setProductError("Selecione um produto."); return; }
    if (product.productSource === "MANUAL" && !product.description) { setProductError("Informe a descrição do produto avulso."); return; }
    if (product.productSource === "MANUAL" && !product.unit.label) { setProductError("Informe a unidade do produto avulso."); return; }
    if (!quantity || Number(quantity) <= 0) { setProductError("Informe uma quantidade maior que zero."); return; }
    if (!unitPriceCents || unitPriceCents <= 0) { setProductError("Informe um valor unitário negociado maior que zero."); return; }
    const duplicate = items.find((item) => {
      if (item.id === editingItemId) return false;
      if (product.productSource === "MANUAL") return item.productSource === "MANUAL" && manualProductKey(item.description, item.supplierUnit.label) === manualProductKey(product.description, product.unit.label);
      return item.productId === product.id && item.supplierUnit.id === product.unit?.id;
    });
    if (duplicate) { setProductError("Este produto já está no pedido. Use a ação Editar na linha existente."); return; }
    const sourceUnit = product.unit || product.supplierUnit;
    const next = { id: editingItemId || globalThis.crypto?.randomUUID?.() || `item-${Date.now()}`, productId: product.id || product.productId, productSource: product.productSource || "EVEREST", everestProductId: product.everestId || product.everestProductId || "", code: product.code || "", description: product.description, quantity, supplierUnit: { ...sourceUnit }, unitPriceCents, subtotalCents: calculateSubtotalCents(quantity, unitPriceCents) };
    setItems((current) => editingItemId ? current.map((item) => item.id === editingItemId ? next : item) : [...current, next]);
    setProductForm(emptyProduct); setSelectedProduct(null); setManualProductDraft(null); setProductListOpen(false); setEditingItemId(null); setProductQuery(""); setErrors((current) => ({ ...current, items: undefined })); touch();
  };

  const editProduct = (item) => {
    if (item.productSource === "MANUAL") {
      setManualProductDraft({ productId: item.productId, unitId: item.supplierUnit.id, description: item.description, code: item.code || "", unitLabel: item.supplierUnit.label });
      setSelectedProduct(null);
    } else {
      const editableProduct = { ...item, id: item.productId, productSource: item.productSource || "EVEREST", unit: item.supplierUnit };
      setSelectedProduct(editableProduct);
      setProducts((current) => current.some((product) => product.id === item.productId) ? current : [...current, editableProduct]);
    }
    setEditingItemId(item.id);
    setProductQuery(item.productSource === "MANUAL" ? item.description : productLabel({ code: item.code, description: item.description }));
    setProductForm({ productId: item.productId, quantity: item.quantity, priceInput: (item.unitPriceCents / 100).toFixed(2).replace(".", ",") });
    setProductError("");
  };

  const removeProduct = (id) => { setItems((current) => current.filter((item) => item.id !== id)); if (editingItemId === id) { setEditingItemId(null); setProductForm(emptyProduct); setSelectedProduct(null); setManualProductDraft(null); setProductQuery(""); setProductListOpen(false); } touch(); };
  const updateAddition = (id, field, value) => { setAdditions((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item)); touch(); };
  const removeAddition = (id) => { setAdditions((current) => current.length === 1 ? [newAddition()] : current.filter((item) => item.id !== id)); touch(); };

  const cancel = async () => {
    if (dirty && !await confirm(isEditing ? "As alterações feitas neste pedido serão descartadas." : "Os dados preenchidos neste pedido serão descartados.", { title: isEditing ? "Descartar alterações?" : "Cancelar pedido?", confirmLabel: isEditing ? "Descartar alterações" : "Descartar dados" })) return;
    setDirty(false); navigate("/compras/pedidos");
  };

  const preventImplicitSubmit = (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving || confirming || submissionLockRef.current) return;
    const preparedAdditions = validAdditions.filter((item) => item.description.trim() || item.amountCents > 0);
    const nextErrors = validatePurchaseDraft({ supplier, items, additions: preparedAdditions });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { document.querySelector(".purchase-field-error")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    submissionLockRef.current = true;
    setConfirming(true);
    const accepted = await confirm(isEditing ? "Confira fornecedor, produtos e valores antes de salvar. O número, a criação e o comprador original serão preservados." : "Confira fornecedor, produtos e valores antes de criar o pedido.", { title: isEditing ? "Salvar alterações do pedido?" : "Finalizar pedido de compra?", confirmLabel: isEditing ? "Salvar alterações" : "Finalizar pedido", cancelLabel: "Revisar pedido" });
    setConfirming(false);
    if (!accepted) { submissionLockRef.current = false; return; }
    setSaving(true);
    try {
      const payload = { supplier, items, additions: preparedAdditions };
      const order = isEditing ? await updatePurchaseOrder(id, payload) : await createPurchaseOrder(payload);
      sessionStorage.setItem(isEditing ? "purchase-order-updated" : "purchase-order-created", order.number);
      setDirty(false);
      navigate(isEditing ? `/compras/pedidos/${order.id}` : `/compras/pedidos/${order.id}/conferencia`, { replace: true });
    } catch (error) { setErrors({ submit: error.response?.data?.error || "Não foi possível salvar o pedido. Tente novamente." }); setSaving(false); submissionLockRef.current = false; }
  };

  if (loadingOrder) return <div className="purchase-detail-skeleton purchase-card" aria-busy="true" aria-label="Carregando pedido para edição"><span /><span /><span /><span /></div>;

  return <form className="purchase-page purchase-form" onSubmit={submit} onKeyDown={preventImplicitSubmit}>
    {loadError && <SystemNotification variant="error">{loadError}</SystemNotification>}
    <header className="purchase-page-header purchase-page-header--stacked"><Link className="purchase-back" to={isEditing ? `/compras/pedidos/${id}` : "/compras/pedidos"}><ArrowLeft size={17} />{isEditing ? "Voltar ao pedido" : "Pedidos de compra"}</Link><div><h1>{isEditing ? "Editar pedido de compra" : "Novo pedido de compra"}</h1><p>{isEditing ? "Número, data de criação e comprador original serão preservados." : "Data e comprador serão registrados automaticamente ao finalizar."}</p></div></header>

    <div className="purchase-form-layout"><div className="purchase-form-main">
      <section className="purchase-card purchase-form-section"><header><div><h2>Dados do pedido e fornecedor</h2></div></header>
        <div className="purchase-field purchase-field--wide"><label htmlFor="supplier-search">Fornecedor</label><div className="purchase-combobox"><div className="purchase-search"><Search size={17} /><input id="supplier-search" role="combobox" aria-autocomplete="list" aria-controls="supplier-options" aria-expanded={supplierListOpen} aria-activedescendant={activeSupplierIndex >= 0 ? `supplier-option-${filteredSuppliers[activeSupplierIndex]?.id}` : undefined} autoComplete="off" autoFocus value={supplierQuery} onChange={(event) => changeSupplierQuery(event.target.value)} onFocus={() => setSupplierListOpen(true)} onClick={() => setSupplierListOpen(true)} onBlur={closeSupplierList} onKeyDown={handleSupplierKeyDown} placeholder="Clique para ver ou digite nome, razão social ou CNPJ" /></div>{supplierListOpen && <div className="purchase-combobox__options" id="supplier-options" role="listbox" aria-label="Fornecedores encontrados">{filteredSuppliers.map((item, index) => <button className={index === activeSupplierIndex ? "is-active" : ""} id={`supplier-option-${item.id}`} key={item.id} type="button" role="option" aria-selected={item.id === supplier?.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSupplier(item)}><strong>{item.name}</strong><span>{item.legalName} · CNPJ {item.cnpj}</span></button>)}{!filteredSuppliers.length && !canUseManualSupplier && <div className="purchase-combobox__empty" role="option" aria-disabled="true">{hasInvalidCompleteCnpj ? "CNPJ inválido. Confira os números informados." : "Nenhum fornecedor encontrado."}</div>}{canUseManualSupplier && <button className="purchase-combobox__create" type="button" onMouseDown={(event) => event.preventDefault()} onClick={chooseManualSupplier}><Plus size={16} /><span><strong>Usar este CNPJ no pedido</strong><small>{formatCnpj(supplierCnpjDigits)} · não será cadastrado no Everest</small></span></button>}</div>}</div>{errors.supplier && <small className="purchase-field-error">{errors.supplier}</small>}</div>
        {supplier && <dl className="purchase-supplier-summary"><div><dt>Nome</dt><dd>{supplier.name}</dd></div><div><dt>Razão social</dt><dd>{supplier.legalName || "—"}</dd></div><div><dt>CNPJ</dt><dd>{supplier.cnpj}</dd></div>{supplier.source === "MANUAL_CNPJ" && <div className="purchase-supplier-summary__note"><dt>Origem</dt><dd>Informado somente neste pedido</dd></div>}</dl>}
      </section>

      <section className={`purchase-card purchase-form-section ${!supplier ? "purchase-form-section--disabled" : ""}`}><header><div><h2>Produtos e acréscimos</h2></div></header>
        {!supplier ? <div className="purchase-locked"><PackagePlus size={28} /><strong>Selecione um fornecedor para adicionar produtos.</strong></div> : <>
          <div className="purchase-product-editor">
            {manualProductDraft ? <div className="purchase-manual-product-fields" aria-label="Produto avulso"><div className="purchase-field"><label htmlFor="manual-product-description">Descrição do produto avulso</label><input id="manual-product-description" value={manualProductDraft.description} onChange={(event) => setManualProductDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: Caixa personalizada" autoFocus /></div><div className="purchase-field"><label htmlFor="manual-product-code">Código <span>(opcional)</span></label><input id="manual-product-code" value={manualProductDraft.code} onChange={(event) => setManualProductDraft((current) => ({ ...current, code: event.target.value }))} placeholder="Ex.: EMB-001" /></div><div className="purchase-field"><label htmlFor="manual-product-unit">Unidade do fornecedor</label><input id="manual-product-unit" value={manualProductDraft.unitLabel} onChange={(event) => setManualProductDraft((current) => ({ ...current, unitLabel: event.target.value }))} placeholder="Ex.: Caixa com 12 unidades" /></div><button className="purchase-button purchase-button--quiet" type="button" onClick={cancelManualProduct}><X size={16} />Cancelar avulso</button></div> : <div className="purchase-field purchase-field--product"><label htmlFor="product-search">Produto</label><div className="purchase-combobox"><div className="purchase-search"><Search size={17} /><input id="product-search" role="combobox" aria-autocomplete="list" aria-controls="product-options" aria-expanded={productListOpen} aria-activedescendant={activeProductIndex >= 0 ? `product-option-${filteredProducts[activeProductIndex]?.id}` : undefined} autoComplete="off" value={productQuery} onChange={(event) => changeProductQuery(event.target.value)} onFocus={() => setProductListOpen(true)} onClick={() => setProductListOpen(true)} onBlur={() => setProductListOpen(false)} onKeyDown={handleProductKeyDown} placeholder="Clique para ver ou digite código ou descrição" /></div>{productListOpen && <div className="purchase-combobox__options" id="product-options" role="listbox" aria-label="Produtos encontrados">{filteredProducts.map((product, index) => <button className={index === activeProductIndex ? "is-active" : ""} id={`product-option-${product.id}`} key={product.id} type="button" role="option" aria-selected={product.id === productForm.productId} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseProduct(product)}><strong>{product.description}</strong><span>{product.code} · {product.unit.label}</span></button>)}{!filteredProducts.length && <div className="purchase-combobox__empty" role="option" aria-disabled="true">Nenhum produto encontrado.</div>}{canAddManualProduct && <button className="purchase-combobox__create" type="button" onMouseDown={(event) => event.preventDefault()} onClick={startManualProduct}><Plus size={16} /><span><strong>Adicionar produto avulso</strong><small>Será usado somente neste pedido</small></span></button>}</div>}</div></div>}
            <div className="purchase-field"><label>Quantidade</label><input aria-label="Quantidade" inputMode="decimal" value={productForm.quantity} onChange={(event) => setProductForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="0,00" /></div>
            {!manualProductDraft && <div className="purchase-field"><label>Unidade do fornecedor</label><input aria-label="Unidade do fornecedor" value={chosenProduct?.unit?.label || (editingItemId ? items.find((item) => item.id === editingItemId)?.supplierUnit.label : "")} readOnly placeholder="Automática" /></div>}
            <div className="purchase-field"><label>Valor unitário negociado</label><div className="purchase-money"><span>R$</span><input aria-label="Valor unitário negociado" inputMode="decimal" value={productForm.priceInput} onChange={(event) => setProductForm((current) => ({ ...current, priceInput: event.target.value }))} placeholder="0,00" /></div></div>
            <button className="purchase-button purchase-button--primary" type="button" onClick={saveProduct}>{editingItemId ? <Check size={17} /> : <Plus size={17} />}{editingItemId ? "Atualizar produto" : "Adicionar produto"}</button>
          </div>
          {productError && <p className="purchase-field-error purchase-editor-error">{productError}</p>}
          {errors.items && <p className="purchase-field-error purchase-editor-error">{errors.items}</p>}
          {productForm.productId && !manualProductDraft && chosenProduct?.productSource !== "MANUAL" && <section className="purchase-history" aria-live="polite" aria-label="Últimas compras deste produto">
            <header><div><h3>Últimas compras deste produto</h3><p>{chosenProduct?.description} com {supplier.name}</p></div></header>
            {historyLoading && <p className="purchase-history__state">Consultando compras anteriores...</p>}
            {!historyLoading && historyError && <div className="purchase-history__state purchase-history__state--error"><span>{historyError}</span><button className="purchase-button purchase-button--quiet" type="button" onClick={() => setHistoryReloadKey((current) => current + 1)}>Tentar novamente</button></div>}
            {!historyLoading && !historyError && !purchaseHistory.length && <p className="purchase-history__state">Nenhuma compra anterior deste produto com este fornecedor.</p>}
            {!historyLoading && !historyError && purchaseHistory.length > 0 && <ol className="purchase-history__list">{purchaseHistory.map((purchase) => <li key={`${purchase.orderId}-${purchase.createdAt}`}><div><span>Data</span><strong>{formatDate(purchase.createdAt)}</strong><small>{purchase.orderNumber}</small></div><div><span>Quantidade</span><strong>{formatQuantity(purchase.quantity)}</strong><small>{purchase.supplierUnit.label}</small></div><div><span>Valor unitário</span><strong>{formatCurrency(purchase.unitPriceCents)}</strong><small>na unidade informada</small></div><button className="purchase-button purchase-button--quiet" type="button" onClick={() => useHistoricalValue(purchase.unitPriceCents)}>Usar valor</button></li>)}</ol>}
          </section>}
          <div className="purchase-table-wrap"><table className="purchase-table purchase-items-table"><thead><tr><th>Código</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Valor unitário</th><th>Subtotal</th><th>Ações</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}><td data-label="Código">{item.code || "—"}</td><td data-label="Descrição"><strong>{item.description}</strong>{item.productSource === "MANUAL" && <small>Produto avulso</small>}</td><td data-label="Quantidade">{formatQuantity(item.quantity)}</td><td data-label="Unidade">{item.supplierUnit.label}</td><td data-label="Valor unitário">{formatCurrency(item.unitPriceCents)}</td><td data-label="Subtotal"><strong>{formatCurrency(item.subtotalCents)}</strong></td><td data-label="Ações"><div className="purchase-row-actions"><button type="button" onClick={() => editProduct(item)} title="Editar produto"><Edit3 size={16} /><span>Editar</span></button><button type="button" onClick={() => removeProduct(item.id)} title="Remover produto"><Trash2 size={16} /><span>Remover</span></button></div></td></tr>) : <tr><td colSpan="7" className="purchase-table-empty">Nenhum produto adicionado.</td></tr>}</tbody></table></div>
          <div className="purchase-additions"><div className="purchase-section-heading"><div><h3>Acréscimos</h3></div><button className="purchase-button purchase-button--quiet" type="button" onClick={() => { setAdditions((current) => [...current, newAddition()]); touch(); }}><Plus size={16} />Adicionar acréscimo</button></div>{additions.map((addition, index) => <div className="purchase-addition-row" key={addition.id}><div className="purchase-field"><label>Descrição</label><input aria-label={`Descrição do acréscimo ${index + 1}`} value={addition.description} onChange={(event) => updateAddition(addition.id, "description", event.target.value)} placeholder="Ex.: Frete" /></div><div className="purchase-field"><label>Valor</label><div className="purchase-money"><span>R$</span><input aria-label={`Valor do acréscimo ${index + 1}`} inputMode="decimal" value={addition.amountInput} onChange={(event) => updateAddition(addition.id, "amountInput", event.target.value)} placeholder="0,00" /></div></div><button type="button" onClick={() => removeAddition(addition.id)} title="Remover acréscimo"><X size={18} /></button>{errors[`addition-${index}`] && <small className="purchase-field-error">{errors[`addition-${index}`]}</small>}</div>)}</div>
        </>}
      </section>
    </div>

    <aside className="purchase-total-slip"><span>Resumo financeiro</span><strong>{formatCurrency(totals.totalCents)}</strong><dl><div><dt>Subtotal dos produtos</dt><dd>{formatCurrency(totals.productSubtotalCents)}</dd></div><div><dt>Total de acréscimos</dt><dd>{formatCurrency(totals.additionsTotalCents)}</dd></div></dl><small>{items.length} produto{items.length === 1 ? "" : "s"} no pedido</small></aside></div>

    <section className="purchase-card purchase-finalize"><div><h2>{isEditing ? "Salvar alterações" : "Finalizar pedido"}</h2></div><div><button className="purchase-button" type="button" onClick={cancel} disabled={saving || confirming}>Cancelar</button><button className="purchase-button purchase-button--primary" type="submit" disabled={saving || confirming}>{saving ? (isEditing ? "Salvando alterações..." : "Criando pedido...") : confirming ? "Aguardando confirmação..." : (isEditing ? "Salvar alterações" : "Criar Pedido de Compra")}</button></div>{errors.submit && <p className="purchase-field-error">{errors.submit}</p>}</section>
  </form>;
}
