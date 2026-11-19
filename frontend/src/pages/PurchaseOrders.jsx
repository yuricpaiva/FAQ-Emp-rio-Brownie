import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Edit3, Eye, FileText, Plus, RotateCcw, Search, ShoppingBasket } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import { useAuth } from "../context/AuthContext";
import { cancelPurchaseOrder, listPurchaseOrders, searchProducts, searchSuppliers } from "../services/purchaseOrderService";
import { formatCurrency, formatDate, formatPaymentMethod, monthKey, normalizeSearch } from "../utils/purchaseOrders";

const initialFilters = () => ({ month: monthKey(), supplierId: "", buyerId: "", number: "", productId: "", status: "" });
const productLabel = (product) => `${product.code} — ${product.description}`;

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm } = useSystemNotification();
  const canManage = user?.role === "admin";
  const [filters, setFilters] = useState(initialFilters);
  const [orders, setOrders] = useState([]);
  const [totalStored, setTotalStored] = useState(0);
  const [suppliers, setSuppliers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productListOpen, setProductListOpen] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [productsError, setProductsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await listPurchaseOrders(filters);
      setOrders(result.orders); setTotalStored(result.totalStored); setBuyers(result.buyers);
    } catch { setError("Não foi possível carregar os pedidos compartilhados. Tente novamente."); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    searchSuppliers().then(setSuppliers);
    searchProducts({}).then(setProducts).catch(() => setProductsError("Não foi possível carregar os produtos."));
  }, []);
  useEffect(() => { load(); }, [load]);
  const filteredProducts = useMemo(() => {
    const term = normalizeSearch(productQuery);
    if (!term || (selectedProduct && productQuery === productLabel(selectedProduct))) return products;
    return products.filter((product) => normalizeSearch(`${product.code} ${product.description}`).includes(term));
  }, [productQuery, products, selectedProduct]);
  useEffect(() => {
    if (!productListOpen) { setActiveProductIndex(-1); return; }
    setActiveProductIndex(filteredProducts.length ? 0 : -1);
  }, [filteredProducts, productListOpen]);
  const hasActiveFilters = filters.month !== monthKey() || filters.supplierId || filters.buyerId || filters.number || filters.productId || filters.status;
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const chooseProduct = (product) => {
    setSelectedProduct(product);
    setProductQuery(productLabel(product));
    set("productId", product.id);
    setProductListOpen(false);
  };
  const changeProductQuery = (value) => {
    setProductQuery(value);
    setSelectedProduct(null);
    set("productId", "");
    setProductListOpen(true);
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
    }
  };
  const clearFilters = () => {
    setFilters(initialFilters());
    setProductQuery("");
    setSelectedProduct(null);
    setProductListOpen(false);
  };
  const cancelOrder = async (order) => {
    const accepted = await confirm(`O pedido ${order.number} permanecerá no histórico e o Romaneio será marcado como CANCELADO.`, { title: "Cancelar pedido de compra?", confirmLabel: "Cancelar pedido", cancelLabel: "Manter pedido" });
    if (!accepted) return;
    setNotice("");
    try {
      await cancelPurchaseOrder(order.id);
      setNotice(`O pedido ${order.number} foi cancelado.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível cancelar o pedido.");
    }
  };

  return <section className="purchase-page">
    {notice && <SystemNotification variant="success">{notice}</SystemNotification>}
    <header className="purchase-page-header">
      <div><h1>Pedidos de compra</h1><p>Consulte pedidos e prepare novas compras para os fornecedores.</p></div>
      <Link className="purchase-button purchase-button--primary" to="/compras/pedidos/novo"><Plus size={18} />Novo Pedido de Compra</Link>
    </header>

    <section className="purchase-card purchase-filters" aria-label="Filtros dos pedidos">
      <label><span>Mês e ano</span><input type="month" value={filters.month} onChange={(event) => set("month", event.target.value)} /></label>
      <label><span>Fornecedor</span><select value={filters.supplierId} onChange={(event) => set("supplierId", event.target.value)}><option value="">Todos</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label><span>Comprador</span><select value={filters.buyerId} onChange={(event) => set("buyerId", event.target.value)}><option value="">Todos</option>{buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}</select></label>
      <label><span>Status</span><select value={filters.status} onChange={(event) => set("status", event.target.value)}><option value="">Todos</option><option value="ACTIVE">Ativos</option><option value="CANCELLED">Cancelados</option></select></label>
      <label className="purchase-filters__search"><span>Número do pedido</span><div><Search size={16} /><input value={filters.number} onChange={(event) => set("number", event.target.value)} placeholder="Ex.: PC-202611-0001" /></div></label>
      <div className="purchase-filter-field"><label htmlFor="order-product-search">Produto</label><div className="purchase-combobox"><div className="purchase-search"><Search size={16} /><input id="order-product-search" role="combobox" aria-autocomplete="list" aria-controls="order-product-options" aria-expanded={productListOpen} aria-activedescendant={activeProductIndex >= 0 ? `order-product-option-${filteredProducts[activeProductIndex]?.id}` : undefined} autoComplete="off" value={productQuery} onChange={(event) => changeProductQuery(event.target.value)} onFocus={() => setProductListOpen(true)} onClick={() => setProductListOpen(true)} onBlur={() => setProductListOpen(false)} onKeyDown={handleProductKeyDown} placeholder="Clique para ver ou digite código ou descrição" /></div>{productListOpen && <div className="purchase-combobox__options" id="order-product-options" role="listbox" aria-label="Produtos encontrados">{filteredProducts.length ? filteredProducts.map((product, index) => <button className={index === activeProductIndex ? "is-active" : ""} id={`order-product-option-${product.id}`} key={product.id} type="button" role="option" aria-selected={product.id === filters.productId} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseProduct(product)}><strong>{product.description}</strong><span>{product.code} · {product.unit.label}</span></button>) : <div className="purchase-combobox__empty" role="option" aria-disabled="true">{productsError || "Nenhum produto encontrado."}</div>}</div>}</div></div>
      <button className="purchase-button purchase-button--quiet" type="button" onClick={clearFilters}><RotateCcw size={16} />Limpar filtros</button>
    </section>

    <section className="purchase-card purchase-list">
      <header><div><h2>Pedidos encontrados</h2><p>{loading ? "Consultando..." : `${orders.length} pedido${orders.length === 1 ? "" : "s"}`}</p></div></header>
      {error && <div className="purchase-state purchase-state--error"><strong>Falha ao carregar</strong><p>{error}</p><button className="purchase-button" onClick={load}>Tentar novamente</button></div>}
      {!error && loading && <div className="purchase-list-skeleton" aria-busy="true" aria-label="Carregando pedidos"><span /><span /><span /><span /></div>}
      {!error && !loading && !orders.length && <div className="purchase-state"><ShoppingBasket size={34} /><strong>{totalStored === 0 ? "Nenhum pedido criado" : hasActiveFilters ? "Nenhum resultado para estes filtros" : "Nenhum pedido neste mês"}</strong><p>{totalStored === 0 ? "Crie o primeiro pedido de compra para começar." : "Ajuste os filtros ou volte ao mês atual."}</p>{totalStored === 0 ? <Link className="purchase-button purchase-button--primary" to="/compras/pedidos/novo">Criar pedido</Link> : <button className="purchase-button" onClick={clearFilters}>Voltar ao mês atual</button>}</div>}
      {!error && !loading && orders.length > 0 && <div className="purchase-table-wrap"><table className="purchase-table"><thead><tr><th>Número</th><th>Data</th><th>Fornecedor</th><th>Comprador</th><th>Pagamento</th><th>Total</th><th>Ações</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className={order.status === "CANCELLED" ? "is-cancelled" : ""}><td data-label="Número"><strong>{order.number}</strong>{order.status === "CANCELLED" && <span className="purchase-status purchase-status--cancelled">Cancelado</span>}</td><td data-label="Data">{formatDate(order.createdAt)}</td><td data-label="Fornecedor"><strong>{order.supplier.name}</strong><small>{order.supplier.cnpj}</small></td><td data-label="Comprador">{order.buyer.name}</td><td data-label="Pagamento"><span className={`purchase-payment-status ${order.paid ? "purchase-payment-status--paid" : ""}`}>{order.paid ? "Pago" : "A pagar"}</span><small>{formatPaymentMethod(order.paymentMethod)}</small></td><td data-label="Total"><strong>{formatCurrency(order.totalCents)}</strong></td><td data-label="Ações"><div className="purchase-row-actions"><button type="button" onClick={() => navigate(`/compras/pedidos/${order.id}`)} title="Visualizar pedido"><Eye size={17} /><span>Visualizar</span></button><button type="button" onClick={() => navigate(`/compras/pedidos/${order.id}/conferencia`)} title="Abrir Romaneio"><FileText size={17} /><span>Romaneio</span></button>{canManage && order.status !== "CANCELLED" && <><button type="button" onClick={() => navigate(`/compras/pedidos/${order.id}/editar`)} title="Editar pedido"><Edit3 size={17} /><span>Editar</span></button><button className="purchase-action--danger" type="button" onClick={() => cancelOrder(order)} title="Cancelar pedido"><Ban size={17} /><span>Cancelar</span></button></>}</div></td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
