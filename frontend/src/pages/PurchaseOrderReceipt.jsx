import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SystemNotification from "../components/SystemNotification";
import { getProductPurchaseHistory, getPurchaseOrder } from "../services/purchaseOrderService";
import { formatCurrency, formatDate, formatPaymentMethod, formatQuantity } from "../utils/purchaseOrders";

export default function PurchaseOrderReceipt() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyByItem, setHistoryByItem] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [createdNumber] = useState(() => sessionStorage.getItem("purchase-order-created") || "");
  useEffect(() => { getPurchaseOrder(id).then(setOrder).finally(() => setLoading(false)); }, [id]);
  useEffect(() => { sessionStorage.removeItem("purchase-order-created"); }, []);
  useEffect(() => {
    if (!order?.signatureRequirement) {
      setHistoryByItem({});
      setHistoryLoading(false);
      return undefined;
    }

    const itemsWithHistory = order.items.filter((item) => item.productSource !== "MANUAL");
    if (!itemsWithHistory.length) {
      setHistoryByItem({});
      setHistoryLoading(false);
      return undefined;
    }

    let current = true;
    setHistoryLoading(true);
    setHistoryByItem({});
    Promise.all(itemsWithHistory.map(async (item) => {
      try {
        const purchases = await getProductPurchaseHistory({ productId: item.productId, limit: 2 });
        return [item.id, { purchases, error: false }];
      } catch {
        return [item.id, { purchases: [], error: true }];
      }
    })).then((entries) => {
      if (current) setHistoryByItem(Object.fromEntries(entries));
    }).finally(() => {
      if (current) setHistoryLoading(false);
    });
    return () => { current = false; };
  }, [order]);
  if (loading) return <div className="purchase-detail-skeleton purchase-card" aria-busy="true" aria-label="Preparando romaneio"><span /><span /><span /><span /></div>;
  if (!order) return <div className="purchase-state purchase-card"><strong>Pedido não encontrado</strong><Link className="purchase-button" to="/compras/pedidos">Voltar à listagem</Link></div>;
  return <section className="purchase-receipt-page">
    {createdNumber && <SystemNotification variant="success" title="Pedido criado">O pedido {createdNumber} foi salvo e já está disponível para os usuários autorizados.</SystemNotification>}
    {order.status === "CANCELLED" && <SystemNotification variant="warning" title="Romaneio de pedido cancelado">Cancelado por {order.cancelledBy?.name || "Administrador"} em {formatDate(order.cancelledAt, true)}.</SystemNotification>}
    <div className="purchase-receipt-actions"><Link className="purchase-button" to={`/compras/pedidos/${order.id}`}><ArrowLeft size={17} />Fechar</Link><button className="purchase-button purchase-button--primary" type="button" onClick={() => window.print()} disabled={historyLoading}>{historyLoading ? "Consultando histórico..." : <><Printer size={17} />Imprimir</>}</button></div>
    <article className={`purchase-receipt ${order.status === "CANCELLED" ? "purchase-receipt--cancelled" : ""}`}>
      {order.status === "CANCELLED" && <div className="purchase-receipt__cancelled-mark" aria-label="Pedido cancelado">CANCELADO</div>}
      <header className="purchase-receipt__header"><img src="/login-logo-placeholder.png" alt="Empório Brownie" /><div><p>Pedido de compra</p><h1>Romaneio de recebimento</h1></div><strong>{order.number}</strong></header>
      <section className="purchase-receipt__meta"><div><span>Criação</span><strong>{formatDate(order.createdAt, true)}</strong></div><div><span>Comprador</span><strong>{order.buyer.name}</strong></div><div><span>Fornecedor</span><strong>{order.supplier.name}</strong><small>{order.supplier.legalName ? <>{order.supplier.legalName}<br /></> : null}CNPJ {order.supplier.cnpj}{order.supplier.source === "MANUAL_CNPJ" ? <><br />Informado somente neste pedido</> : null}</small></div></section>
      <section className="purchase-receipt__payment"><div><span>Pagamento</span><strong>{order.paid ? "Pago" : "A pagar"}</strong></div><div><span>Forma</span><strong>{formatPaymentMethod(order.paymentMethod)}</strong></div><div><span>Observação</span><strong>{order.paymentNote || "—"}</strong></div></section>
      <table className="purchase-receipt__table"><thead><tr><th>Código</th><th>Produto</th><th>Qtd. pedida</th><th>Unidade</th><th>Qtd. recebida</th><th>Valor unit. comprado</th><th>Valor unit. conferido</th><th>Subtotal</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.code || "—"}</td><td>{item.description}{item.productSource === "MANUAL" ? <><br /><small>Produto avulso</small></> : null}</td><td>{formatQuantity(item.quantity)}</td><td>{item.supplierUnit.label}</td><td className="purchase-receipt__blank" /><td>{formatCurrency(item.unitPriceCents)}</td><td className="purchase-receipt__blank" /><td>{formatCurrency(item.subtotalCents)}</td></tr>)}</tbody></table>
      {order.signatureRequirement && <section className="purchase-receipt__approval-history">
        <header><h2>Comparativo para aprovação adicional</h2><small>Valor atual e as 2 últimas compras no Everest, considerando todos os fornecedores</small></header>
        <div className="purchase-receipt__history-products">{order.items.map((item) => {
          const history = historyByItem[item.id];
          return <article className="purchase-receipt__history-product" key={item.id}>
            <div className="purchase-receipt__history-product-title"><strong>{item.description}</strong><small>{item.code ? `Código ${item.code}` : "Produto avulso"} · {item.supplierUnit.label}</small></div>
            <div className="purchase-receipt__price-comparison">
              <div className="purchase-receipt__price purchase-receipt__price--current"><span>Compra atual</span><strong>{formatCurrency(item.unitPriceCents)}</strong><small>{formatQuantity(item.quantity)} {item.supplierUnit.label}</small></div>
              {item.productSource === "MANUAL" && <div className="purchase-receipt__history-state">Histórico indisponível para produto avulso.</div>}
              {item.productSource !== "MANUAL" && historyLoading && !history && <div className="purchase-receipt__history-state">Consultando histórico...</div>}
              {item.productSource !== "MANUAL" && !historyLoading && history?.error && <div className="purchase-receipt__history-state purchase-receipt__history-state--error">Não foi possível consultar o histórico.</div>}
              {item.productSource !== "MANUAL" && !historyLoading && history && !history.error && history.purchases.length === 0 && <div className="purchase-receipt__history-state">Nenhuma compra anterior encontrada.</div>}
              {history?.purchases.map((purchase, index) => <div className="purchase-receipt__price" key={`${purchase.orderId}-${purchase.createdAt}`}><span>{index + 1}ª compra anterior</span><strong>{formatCurrency(purchase.unitPriceCents)}</strong><small>{formatDate(purchase.createdAt)} · {purchase.supplier.name}</small><small>{formatQuantity(purchase.quantity)} {purchase.supplierUnit.label} · {purchase.orderNumber}</small></div>)}
            </div>
          </article>;
        })}</div>
      </section>}
      <section className="purchase-receipt__bottom"><div className="purchase-receipt__notes"><h2>Observações ou divergências</h2><span /><span /><span /></div><div className="purchase-receipt__totals"><div><span>Subtotal dos produtos</span><strong>{formatCurrency(order.productSubtotalCents)}</strong></div>{order.additions.map((addition) => <div key={addition.id}><span>{addition.description}</span><strong>{formatCurrency(addition.amountCents)}</strong></div>)}<div className="purchase-receipt__grand-total"><span>Total do pedido</span><strong>{formatCurrency(order.totalCents)}</strong></div></div></section>
      <footer className="purchase-receipt__signatures"><div><span /><strong>Comprador</strong><small>{order.buyer.name}</small></div><div><span /><strong>Estoquista responsável</strong><small>Assinatura e nome legível</small></div>{order.signatureRequirement?.label && <div><span /><strong>{order.signatureRequirement.label}</strong><small>Assinatura e nome legível</small></div>}<div><span /><strong>Data do recebimento</strong><small>____ / ____ / ______</small></div></footer>
    </article>
  </section>;
}
