import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function FormsAccessRoute({ children }) {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(user?.role === "admin" ? true : null);

  useEffect(() => {
    if (user?.role === "admin") { setHasAccess(true); return; }
    let active = true;
    setHasAccess(null);
    api.get("/forms/access").then((response) => { if (active) setHasAccess(Boolean(response.data.hasAccess)); }).catch(() => { if (active) setHasAccess(false); });
    return () => { active = false; };
  }, [user?.id, user?.role]);

  if (hasAccess === null) return <div className="app-loader"><div className="app-loader__card"><span className="app-loader__dot" /><p>Verificando acesso...</p></div></div>;
  if (!hasAccess) return <Navigate to="/" replace />;
  return children;
}

export default FormsAccessRoute;
