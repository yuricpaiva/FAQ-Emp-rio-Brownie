import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import api from "../services/api";

export default function SacAccessRoute({ children }) {
  const [state, setState] = useState({ loading: true, allowed: false });
  useEffect(() => {
    let active = true;
    api.get("/sac/access").then((response) => {
      if (active) setState({ loading: false, allowed: Boolean(response.data.hasAccess) });
    }).catch(() => { if (active) setState({ loading: false, allowed: false }); });
    return () => { active = false; };
  }, []);
  if (state.loading) return <div className="app-loader"><div className="app-loader__card"><span className="app-loader__dot" /><p>Carregando SAC...</p></div></div>;
  return state.allowed ? children : <Navigate to="/" replace />;
}
