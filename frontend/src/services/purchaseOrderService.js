import api from "./api";

export async function searchSuppliers(query = "") {
  const response = await api.get("/purchases/suppliers", { params: query ? { query } : {} });
  return response.data;
}

export async function searchProducts({ supplierId, query = "" }) {
  const response = await api.get("/purchases/products", { params: { ...(supplierId ? { supplierId } : {}), ...(query ? { query } : {}) } });
  return response.data;
}

export async function getPurchaseAccess() {
  const response = await api.get("/purchases/access");
  return response.data;
}

export async function listPurchaseOrders(filters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined));
  const response = await api.get("/purchases/orders", { params });
  return response.data;
}

export async function getPurchaseOrder(id) {
  try {
    const response = await api.get(`/purchases/orders/${id}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

export async function getProductPurchaseHistory({ supplierId, productId, limit = 2 }) {
  const response = await api.get("/purchases/history/products", { params: { supplierId, productId, limit } });
  return response.data;
}

export async function getPurchaseSettings() {
  const response = await api.get("/knowledge/purchase-settings");
  return response.data;
}

export async function createPurchaseOrder(input) {
  const response = await api.post("/purchases/orders", input);
  return response.data;
}

export async function updatePurchaseOrder(id, input) {
  const response = await api.put(`/purchases/orders/${id}`, input);
  return response.data;
}

export async function cancelPurchaseOrder(id) {
  const response = await api.patch(`/purchases/orders/${id}/cancel`);
  return response.data;
}
