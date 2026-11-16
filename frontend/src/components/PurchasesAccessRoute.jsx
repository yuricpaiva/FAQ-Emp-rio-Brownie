import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPurchaseAccess } from "../services/purchaseOrderService";

export default function PurchasesAccessRoute({ children, adminOnly = false }) {
  const { user } = useAuth();
  const [access, setAccess] = useState(user?.role === "admin" ? { hasAccess: true, canManage: true } : null);

  useEffect(() => {
    if (user?.role === "admin") { setAccess({ hasAccess: true, canManage: true }); return; }
    let active = true;
    setAccess(null);
    getPurchaseAccess()
      .then((result) => { if (active) setAccess(result); })
      .catch(() => { if (active) setAccess({ hasAccess: false, canManage: false }); });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  if (access === null) return <div className="app-loader"><div className="app-loader__card"><span className="app-loader__dot" /><p>Verificando acesso...</p></div></div>;
  if (!access.hasAccess || (adminOnly && !access.canManage)) return <Navigate to="/" replace />;
  return children;
}
