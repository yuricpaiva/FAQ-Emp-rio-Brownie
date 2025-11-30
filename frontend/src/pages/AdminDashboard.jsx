import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";

function AdminDashboard() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userPhoto, setUserPhoto] = useState(null);
  const [userMessage, setUserMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);

  const loadArticles = async () => {
    try {
      const res = await api.get("/articles");
      setArticles(res.data);
      setError("");
    } catch (err) {
      setError("Não foi possível carregar artigos.");
    }
  };

  useEffect(() => {
    const logged = localStorage.getItem("faqAdmin");
    if (!logged) {
      navigate("/admin/login");
      return;
    }
    loadArticles();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja remover este artigo?")) return;
    try {
      await api.delete(`/admin/articles/${id}`);
      loadArticles();
    } catch {
      setError("Não foi possível remover o artigo.");
    }
  };

  const filtered = articles.filter((article) =>
    article.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const loadUsers = async () => {
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch {
      setUserMessage("Não foi possível carregar usuários.");
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserMessage("");
    try {
      let photoUrl = "";
      if (userPhoto) {
        const formData = new FormData();
        formData.append("file", userPhoto);
        const upload = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoUrl = upload.data.url;
      }

      if (editingUserId) {
        await api.put(`/admin/users/${editingUserId}`, {
          name: userName,
          email: userEmail,
          password: userPassword || undefined,
          photoUrl,
        });
        setUserMessage("Usuário atualizado com sucesso.");
      } else {
        await api.post("/admin/users", {
          name: userName,
          email: userEmail,
          password: userPassword,
          photoUrl,
        });
        setUserMessage("Usuário criado com sucesso.");
      }
      loadUsers();
      setUserName("");
      setUserEmail("");
      setUserPassword("");
      setUserPhoto(null);
      setEditingUserId(null);
      setShowUserForm(false);
    } catch (err) {
      setUserMessage(err.response?.data?.error || "Não foi possível criar o usuário.");
    }
  };

  const handleToggleActive = async (id, active) => {
    try {
      await api.put(`/admin/users/${id}`, { active });
      loadUsers();
    } catch {
      setUserMessage("Não foi possível atualizar status do usuário.");
    }
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword("");
    setUserPhoto(null);
    setUserMessage("");
    setShowUserForm(true);
  };

  return (
    <section
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        color: "#71594E",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.9rem", fontWeight: 800, letterSpacing: "0.01em" }}>
            Painel de Controle
          </h1>
          <p style={{ margin: "0.2rem 0 0", color: "#8b7468" }}>
            Gerencie os artigos do FAQ.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input
            type="text"
            placeholder="Buscar artigo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              padding: "0.7rem 0.9rem",
              borderRadius: "12px",
              border: "1px solid #d7c7bc",
              background: "#fdfaf7",
              color: "#71594E",
              minWidth: "220px",
              fontWeight: 600,
            }}
          />
          <button
            type="button"
            onClick={() => {
              setShowUserForm(true);
              loadUsers();
              setEditingUserId(null);
              setUserName("");
              setUserEmail("");
              setUserPassword("");
              setUserPhoto(null);
              setUserMessage("");
            }}
            style={{
              padding: "0.85rem 1.1rem",
              borderRadius: "12px",
              background: "#fdfaf7",
              color: "#71594E",
              fontWeight: 800,
              border: "1px solid #d7c7bc",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Usuários
          </button>
          <Link
            to="/admin/artigos/novo"
            style={{
              padding: "0.85rem 1.2rem",
              borderRadius: "12px",
              background: "#71594E",
              color: "#f3e6df",
              fontWeight: 800,
              textDecoration: "none",
              boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
              whiteSpace: "nowrap",
            }}
          >
            Novo Artigo
          </Link>
        </div>
      </div>

      {error && (
        <p style={{ color: "#c0392b", fontSize: "0.95rem", marginBottom: "1rem" }}>{error}</p>
      )}

      {showUserForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          onClick={() => setShowUserForm(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "1rem",
              maxWidth: "960px",
              width: "100%",
              border: "1px solid #e3d6cb",
              boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#71594E" }}>Usuários</h3>
              <button
                type="button"
                onClick={() => {
                  setShowUserForm(false);
                  setEditingUserId(null);
                  setUserMessage("");
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "1.1rem",
                  cursor: "pointer",
                  color: "#71594E",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "1rem", overflowX: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 2fr 1fr 1fr",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  background: "#f8f1ec",
                  borderRadius: "12px",
                  border: "1px solid #e3d6cb",
                  fontWeight: 700,
                  color: "#5d4a42",
                }}
              >
                <span>Nome</span>
                <span>Email</span>
                <span>Status</span>
                <span style={{ textAlign: "right" }}>Ações</span>
              </div>
              <div>
                {users.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 2fr 1fr 1fr",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      borderBottom: "1px solid #f0e6df",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {user.photoUrl ? (
                        <img
                          src={user.photoUrl}
                          alt={user.name}
                          style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            background: "#f3e6df",
                            color: "#71594E",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 800,
                          }}
                        >
                          {(user.name || "US")
                            .split(" ")
                            .filter(Boolean)
                            .map((w) => w[0]?.toUpperCase())
                            .join("")
                            .slice(0, 2)}
                        </div>
                      )}
                      <span>{user.name}</span>
                    </div>
                    <span>{user.email}</span>
                    <span style={{ fontWeight: 800, color: user.active ? "#2c7a38" : "#c0392b" }}>
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleEditUser(user)}
                        style={{
                          padding: "0.55rem 0.75rem",
                          borderRadius: "10px",
                          border: "1px solid #d7c7bc",
                          background: "#fdfaf7",
                          color: "#71594E",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(user.id, !user.active)}
                        style={{
                          padding: "0.55rem 0.75rem",
                          borderRadius: "10px",
                          border: "none",
                          background: user.active ? "#c0392b" : "#2c7a38",
                          color: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                        }}
                      >
                        {user.active ? "Inativar" : "Ativar"}
                      </button>
                    </div>
                  </div>
                ))}
                {users.length === 0 && <p style={{ padding: "0.75rem" }}>Nenhum usuário encontrado.</p>}
              </div>
            </div>

            <h4 style={{ margin: "0 0 0.75rem", color: "#71594E" }}>
              {editingUserId ? "Editar usuário" : "Novo usuário (admin)"}
            </h4>
            <form onSubmit={handleCreateUser} style={{ display: "grid", gap: "0.6rem" }}>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>Nome</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  style={{
                    padding: "0.7rem 0.9rem",
                    borderRadius: "12px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>Email</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  required
                  style={{
                    padding: "0.7rem 0.9rem",
                    borderRadius: "12px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>
                  {editingUserId ? "Senha (opcional)" : "Senha"}
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  required={!editingUserId}
                  placeholder={editingUserId ? "Deixe em branco para manter" : ""}
                  style={{
                    padding: "0.7rem 0.9rem",
                    borderRadius: "12px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>Foto (opcional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setUserPhoto(e.target.files?.[0] || null)}
                  style={{
                    padding: "0.4rem 0",
                    color: "#71594E",
                  }}
                />
              </div>
              {userMessage && (
                <p style={{ margin: 0, color: userMessage.includes("sucesso") ? "#2c7a38" : "#c0392b" }}>
                  {userMessage}
                </p>
              )}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserForm(false);
                    setEditingUserId(null);
                    setUserMessage("");
                  }}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    border: "none",
                    background: "#71594E",
                    color: "#f3e6df",
                    fontWeight: 800,
                    cursor: "pointer",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                  }}
                >
                  {editingUserId ? "Salvar" : "Criar Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e3d6cb",
          borderRadius: "16px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 1fr 180px",
            gap: "0.75rem",
            padding: "0.9rem 1rem",
            background: "#f8f1ec",
            borderBottom: "1px solid #e3d6cb",
            fontWeight: 700,
            color: "#5d4a42",
          }}
        >
          <span>Título</span>
          <span style={{ textAlign: "center" }}>Categoria</span>
          <span style={{ textAlign: "right" }}>Ações</span>
        </div>

        {filtered.map((article) => (
          <div
            key={article.id}
            style={{
              display: "grid",
              gridTemplateColumns: "3fr 1fr 180px",
              gap: "0.75rem",
              padding: "1rem",
              borderBottom: "1px solid #f0e6df",
              alignItems: "center",
            }}
          >
            <div>
              <p style={{ margin: 0, color: "#8b7468", fontSize: "0.85rem" }}>{article.slug}</p>
              <p style={{ margin: "0.2rem 0 0", fontWeight: 800, fontSize: "1.05rem" }}>
                {article.title}
              </p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#8b7468" }}>
                Atualizado em {new Date(article.updatedAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div style={{ textAlign: "center", fontWeight: 700 }}>{article.category}</div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                alignItems: "center",
              }}
            >
              <Link
                to={`/admin/artigos/${article.id}/editar`}
                style={{
                  padding: "0.55rem 0.85rem",
                  borderRadius: "10px",
                  border: "1px solid #d7c7bc",
                  background: "#fdfaf7",
                  color: "#71594E",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Editar
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(article.id)}
                style={{
                  padding: "0.55rem 0.85rem",
                  borderRadius: "10px",
                  border: "none",
                  background: "#c0392b",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                }}
              >
                Remover
              </button>
            </div>
          </div>
        ))}

        {articles.length === 0 && (
          <p style={{ padding: "1rem", margin: 0, textAlign: "center" }}>Nenhum artigo cadastrado.</p>
        )}
      </div>
    </section>
  );
}

export default AdminDashboard;
