import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@admin.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api.post("/login", { email, password });
      const { name, photoUrl } = res.data || {};
      localStorage.setItem("faqAdmin", email);
      localStorage.setItem(
        "faqAdminData",
        JSON.stringify({ email, name: name || email, photoUrl: photoUrl || "" })
      );
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Falha no login");
    }
  };

  return (
    <section
      style={{
        maxWidth: "520px",
        margin: "0 auto",
        background: "#fff",
        border: "1px solid #e3d6cb",
        borderRadius: "16px",
        padding: "2rem",
        boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: "#71594E",
            display: "grid",
            placeItems: "center",
            color: "#f3e6df",
            fontWeight: 800,
            fontSize: "1.2rem",
          }}
        >
          🛡️
        </div>
        <div>
          <p style={{ margin: 0, color: "#71594E", fontWeight: 700 }}>
            Área Administrativa
          </p>
          <p style={{ margin: 0, color: "#8b7468", fontSize: "0.9rem" }}>
            Faça login para gerenciar o FAQ
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.95rem",
              color: "#71594E",
              marginBottom: "0.35rem",
              fontWeight: 700,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "0.9rem 1rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              fontSize: "1rem",
              outline: "none",
              color: "#71594E",
              background: "#fdfaf7",
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.95rem",
              color: "#71594E",
              marginBottom: "0.35rem",
              fontWeight: 700,
            }}
          >
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "0.9rem 1rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              fontSize: "1rem",
              outline: "none",
              color: "#71594E",
              background: "#fdfaf7",
            }}
          />
        </div>
        {error && (
          <p style={{ color: "#c0392b", fontSize: "0.95rem", margin: 0 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "0.9rem",
            borderRadius: "12px",
            border: "none",
            background: "#71594E",
            color: "#f3e6df",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: "pointer",
            boxShadow: "0 10px 20px rgba(0,0,0,0.1)",
          }}
        >
          Entrar
        </button>
      </form>
    </section>
  );
}

export default AdminLogin;
