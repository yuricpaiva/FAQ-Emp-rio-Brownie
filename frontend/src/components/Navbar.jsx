import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";

const linkStyle = ({ isActive }) => ({
  padding: "0.35rem 0.7rem",
  borderRadius: "9999px",
  fontWeight: 600,
  fontSize: "0.9rem",
  color: isActive ? "#71594E" : "#f3e6df",
  backgroundColor: isActive ? "#f3e6df" : "transparent",
  textDecoration: "none",
  transition: "background-color 150ms ease, color 150ms ease",
});

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [logged, setLogged] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const [modalMessage, setModalMessage] = useState("");

  const initials =
    userData?.name
      ?.split(" ")
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "US";

  useEffect(() => {
    const syncLogin = () => {
      const stored = localStorage.getItem("faqAdminData");
      setLogged(!!localStorage.getItem("faqAdmin"));
      setUserData(stored ? JSON.parse(stored) : null);
    };
    syncLogin();
    window.addEventListener("storage", syncLogin);
    return () => window.removeEventListener("storage", syncLogin);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("faqAdminData");
    setLogged(!!localStorage.getItem("faqAdmin"));
    setUserData(stored ? JSON.parse(stored) : null);
    setFormName(stored ? JSON.parse(stored).name || "" : "");
    setFormEmail(stored ? JSON.parse(stored).email || "" : "");
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("faqAdmin");
    localStorage.removeItem("faqAdminData");
    setLogged(false);
    setUserData(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormPhoto(null);
    setShowModal(false);
    navigate("/admin/login");
  };

  const handleAvatarClick = () => {
    if (!userData) return;
    setFormName(userData.name || "");
    setFormEmail(userData.email || "");
    setFormPassword("");
    setFormPhoto(null);
    setModalMessage("");
    setShowModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setModalMessage("");
    try {
      let photoUrl = userData?.photoUrl || "";
      if (formPhoto) {
        const formData = new FormData();
        formData.append("file", formPhoto);
        const upload = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoUrl = upload.data.url;
      }

      const payload = {
        name: formName,
        email: formEmail,
        photoUrl,
      };
      if (formPassword) payload.password = formPassword;

      const res = await api.put("/admin/users/me", payload);
      const updated = {
        email: res.data.email,
        name: res.data.name,
        photoUrl: res.data.photoUrl || "",
      };
      localStorage.setItem("faqAdminData", JSON.stringify(updated));
      localStorage.setItem("faqAdmin", updated.email);
      setUserData(updated);
      setShowModal(false);
    } catch (err) {
      setModalMessage(
        err.response?.data?.error || "Não foi possível atualizar o usuário."
      );
    }
  };

  return (
    <>
      <header
        style={{
          backgroundColor: "#71594E",
          borderBottom: "1px solid #5f4a41",
        }}
      >
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            padding: "0.4rem 0.3rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <img
              src="/emporio-placeholder.png"
              alt="Emporio Brownie"
              style={{
                width: "50px",
                height: "50px",
                objectFit: "cover",
                borderRadius: "12px",
              }}
            />
            <Link
              to="/"
              style={{
                fontSize: "1rem",
                fontWeight: 300,
                color: "#f3e6df",
                textDecoration: "none",
                lineHeight: 1,
                display: "inline-block",
                textAlign: "center",
                marginLeft: "0.35rem",
              }}
            >
              FAQ Emporio Brownie
            </Link>
          </div>
          <nav style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <NavLink to="/" style={linkStyle}>
              Início
            </NavLink>
            {!logged && (
              <NavLink to="/admin/login" style={linkStyle}>
                Login
              </NavLink>
            )}
            {logged && (
              <>
                <NavLink to="/admin/dashboard" style={linkStyle}>
                  Painel de Controle
                </NavLink>
                {(userData?.photoUrl || userData?.name) && (
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    {userData?.photoUrl ? (
                      <img
                        src={userData.photoUrl}
                        alt={userData.name || "Usuário"}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "1px solid #f3e6df",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          background: "#f3e6df",
                          color: "#71594E",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          border: "1px solid #f3e6df",
                        }}
                      >
                        {initials}
                      </div>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    padding: "0.35rem 0.7rem",
                    borderRadius: "9999px",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "#fff",
                    backgroundColor: "#c0392b",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                  }}
                >
                  Sair
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {showModal && (
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
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "1.5rem",
              maxWidth: "480px",
              width: "100%",
              border: "1px solid #e3d6cb",
              boxShadow: "0 18px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, color: "#71594E" }}>Editar perfil</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
            <form
              onSubmit={handleUpdateUser}
              style={{ display: "grid", gap: "0.8rem", marginTop: "1rem" }}
            >
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>
                  Nome
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  style={{
                    padding: "0.8rem 0.9rem",
                    borderRadius: "10px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                  style={{
                    padding: "0.8rem 0.9rem",
                    borderRadius: "10px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>
                  Senha
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Deixe em branco para manter"
                  style={{
                    padding: "0.8rem 0.9rem",
                    borderRadius: "10px",
                    border: "1px solid #d7c7bc",
                    background: "#fdfaf7",
                    color: "#71594E",
                  }}
                />
              </div>
              <div style={{ display: "grid", gap: "0.25rem" }}>
                <label style={{ fontWeight: 700, color: "#71594E" }}>
                  Foto
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormPhoto(e.target.files?.[0] || null)}
                  style={{ color: "#71594E" }}
                />
              </div>
              {modalMessage && (
                <p
                  style={{
                    margin: 0,
                    color: modalMessage.includes("sucesso")
                      ? "#2c7a38"
                      : "#c0392b",
                  }}
                >
                  {modalMessage}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  Cancelar
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
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
