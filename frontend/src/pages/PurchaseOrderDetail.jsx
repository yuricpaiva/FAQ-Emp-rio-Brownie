import { ArrowLeft, Ban, Edit3, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";
import { useAuth } from "../context/AuthContext";
import { cancelPurchaseOrder, getPurchaseOrder } from "../services/purchaseOrderService";
import { formatCurrency, formatDate, formatPaymentMethod, formatQuantity } from "../utils/purchaseOrders";

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm } = useSystemNotification();
  const canManage = user?.role === "admin";
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedNumber] = useState(() => sessionStorage.getItem("purchase-order-updated") || "");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    getPurchaseOrder(id).then(setOrder).catch(() => setError("Não foi possível carregar o pedido.")).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { sessionStorage.removeItem("purchase-order-updated"); }, []);

  const cancelOrder = async () => {
    const accepted = await confirm(`O pedido ${order.number} permanecerá no histórico e o Romaneio será marcado como CANCELADO.`, { title: "Cancelar pedido de compra?", confirmLabel: "Cancelar pedido", cancelLabel: "Manter pedido" });
    if (!accepted) return;
    try {
      const cancelled = await cancelPurchaseOrder(order.id);
      setOrder(cancelled);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Não foi possível cancelar o pedido.");
    }
  };

  if (loading) return <div className="purchase-detail-skeleton purchase-card" aria-busy="true" aria-label="Carregando pedido"><span /><span /><span /><span /></div>;
  if (!order) return <div className="purchase-state purchase-card"><strong>Pedido não encontrado</strong><p>{error || "O pedido solicitado não está disponível."}</p><Link className="purchase-button" to="/compras/pedidos">Voltar à listagem</Link></div>;
  return <section className="purchase-page">
    {updatedNumber === order.number && <SystemNotification variant="success">As alterações do pedido {order.number} foram salvas.</SystemNotification>}
    {error && <SystemNotification variant="error">{error}</SystemNotification>}
    {order.status === "CANCELLED" && <SystemNotification variant="warning" title="Pedido cancelado">Cancelado por {order.cancelledBy?.name || "Administrador"} em {formatDate(order.cancelledAt, true)}. O registro e o Romaneio permanecem disponíveis para consulta.</SystemNotification>}
    <header className="purchase-page-header purchase-page-header--detail"><div><Link className="purchase-back" to="/compras/pedidos"><ArrowLeft size={17} />Pedidos de compra</Link><div className="purchase-title-line"><h1>{order.number}</h1>{order.status === "CANCELLED" && <span className="purchase-status purchase-status--cancelled">Cancelado</span>}</div><p>Criado em {formatDate(order.createdAt, true)}{order.updatedAt !== order.createdAt ? ` · Atualizado em ${formatDate(order.updatedAt, true)}` : ""}</p></div><div className="purchase-header-actions"><Link className="purchase-button purchase-button--primary" to={`/compras/pedidos/${order.id}/conferencia`}><FileText size={17} />Abrir Romaneio</Link>{canManage && order.status !== "CANCELLED" && <><button className="purchase-button" type="button" onClick={() => navigate(`/compras/pedidos/${order.id}/editar`)}><Edit3 size={17} />Editar</button><button className="purchase-button purchase-button--danger" type="button" onClick={cancelOrder}><Ban size={17} />Cancelar pedido</button></>}</div></header>
    <div className="purchase-detail-grid">
      <section className="purchase-card purchase-detail-card"><h2>Pedido e fornecedor</h2><dl className="purchase-definition"><div><dt>Comprador</dt><dd>{order.buyer.name}</dd></div><div><dt>Fornecedor</dt><dd>{order.supplier.name}</dd></div><div><dt>Razão social</dt><dd>{order.supplier.legalName || "—"}</dd></div><div><dt>CNPJ</dt><dd>{order.supplier.cnpj}</dd></div>{order.supplier.source === "MANUAL_CNPJ" && <div><dt>Origem</dt><dd>Informado somente neste pedido</dd></div>}<div><dt>Situação do pagamento</dt><dd><span className={`purchase-payment-status ${order.paid ? "purchase-payment-status--paid" : ""}`}>{order.paid ? "Pago" : "A pagar"}</span></dd></div><div><dt>Forma de pagamento</dt><dd>{formatPaymentMethod(order.paymentMethod)}</dd></div>{order.paymentNote && <div className="purchase-definition__wide"><dt>Observação do pagamento</dt><dd>{order.paymentNote}</dd></div>}</dl></section>
      <aside className="purchase-total-slip"><span>Total do pedido</span><strong>{formatCurrency(order.totalCents)}</strong><dl><div><dt>Produtos</dt><dd>{formatCurrency(order.productSubtotalCents)}</dd></div><div><dt>Acréscimos</dt><dd>{formatCurrency(order.additionsTotalCents)}</dd></div></dl></aside>
    </div>
    <section className="purchase-card"><h2>Produtos</h2><div className="purchase-table-wrap"><table className="purchase-table"><thead><tr><th>Código</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td data-label="Código">{item.code || "—"}</td><td data-label="Descrição"><strong>{item.description}</strong>{item.productSource === "MANUAL" && <small>Produto avulso</small>}</td><td data-label="Quantidade">{formatQuantity(item.quantity)}</td><td data-label="Unidade">{item.supplierUnit.label}</td><td data-label="Valor unitário">{formatCurrency(item.unitPriceCents)}</td><td data-label="Subtotal"><strong>{formatCurrency(item.subtotalCents)}</strong></td></tr>)}</tbody></table></div></section>
    <section className="purchase-card purchase-additions-view"><h2>Acréscimos</h2>{order.additions.length ? order.additions.map((addition) => <div key={addition.id}><span>{addition.description}</span><strong>{formatCurrency(addition.amountCents)}</strong></div>) : <p>Nenhum acréscimo informado.</p>}</section>
  </section>;
}
