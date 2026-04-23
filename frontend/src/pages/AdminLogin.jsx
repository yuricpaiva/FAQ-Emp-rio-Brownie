import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, consumeAuthMessage } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const authMessage = consumeAuthMessage();
    if (authMessage) {
      setError(authMessage);
    }
  }, [consumeAuthMessage]);

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      const nextPath = location.state?.from || "/";
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-screen">
      <div className="login-screen__backdrop" />
      <div className="login-card">
        <div className="login-card__brand">
          <div>
            <h1>FAQ Empório Brownie</h1>
          </div>
        </div>

        <p className="login-card__copy">
          Faça login para acessar a base interna de conhecimento, navegar pelas categorias e gerenciar conteúdos.
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p className="form-message form-message--error">{error}</p>}

          <button type="submit" className="button login-card__submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default AdminLogin;
