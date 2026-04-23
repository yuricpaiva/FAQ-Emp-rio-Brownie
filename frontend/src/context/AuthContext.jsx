import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { setUnauthorizedHandler } from "../services/api";

const AuthContext = createContext(null);
const AUTH_MESSAGE_KEY = "faq_auth_message";

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.get("/auth/me", { skipAuthHandling: true });
      setUser(res.data);
      return res.data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (location.pathname !== "/login") {
        sessionStorage.setItem(
          AUTH_MESSAGE_KEY,
          "Sua sessão expirou. Faça login novamente."
        );
        navigate("/login", { replace: true });
      }
    });

    return () => setUnauthorizedHandler(null);
  }, [location.pathname, navigate]);

  const login = async (email, password) => {
    const res = await api.post(
      "/auth/login",
      { email, password },
      { skipAuthHandling: true }
    );
    sessionStorage.removeItem(AUTH_MESSAGE_KEY);
    setUser(res.data);
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout", null, { skipAuthHandling: true });
    } finally {
      sessionStorage.removeItem(AUTH_MESSAGE_KEY);
      setUser(null);
    }
  };

  const consumeAuthMessage = () => {
    const message = sessionStorage.getItem(AUTH_MESSAGE_KEY) || "";
    if (message) {
      sessionStorage.removeItem(AUTH_MESSAGE_KEY);
    }
    return message;
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      updateUser,
      consumeAuthMessage,
      hasRole: (roles) => !!user && roles.includes(user.role)
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
