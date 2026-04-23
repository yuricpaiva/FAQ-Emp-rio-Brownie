import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCategoryIcon } from "../constants/categoryIcons";

const STORAGE_KEY = "faq_sidebar_collapsed";

function Sidebar() {
  const navigate = useNavigate();
  const { user, logout, updateUser, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [categories, setCategories] = useState([]);
  const [showProfile, setShowProfile] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!user) return;
    setFormName(user.name || "");
    setFormEmail(user.email || "");
  }, [user]);

  useEffect(() => {
    api
      .get("/knowledge/categories")
      .then((res) => setCategories(res.data))
      .catch(() => setCategories([]));
  }, []);

  const initials = useMemo(
    () =>
      user?.name
        ?.split(" ")
        .filter(Boolean)
        .map((word) => word[0]?.toUpperCase())
        .join("")
        .slice(0, 2) || "US",
    [user]
  );

  const collapseSidebar = () => {
    setCollapsed(true);
  };

  const handleLogout = async () => {
    collapseSidebar();
    await logout();
    navigate("/login", { replace: true });
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      let photoUrl = user?.photoUrl || "";
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
      updateUser(res.data);
      setShowProfile(false);
    } catch (err) {
      setMessage(err.response?.data?.error || "Não foi possível atualizar o perfil.");
    }
  };

  return (
    <>
      <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
        <div className="sidebar__top">
          {!collapsed && (
            <Link to="/" className="sidebar__brand" onClick={collapseSidebar}>
              <strong>FAQ Empório Brownie</strong>
            </Link>
          )}
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir menu" : "Retratar menu"}
          >
            <span className="sidebar__toggle-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>

        <div className="sidebar__group">
          <NavLink to="/" end className="sidebar__link" onClick={collapseSidebar}>
            <img src="/icon-home.svg" alt="" className="sidebar__nav-icon" />
            {!collapsed && <span>Início</span>}
          </NavLink>
          {hasRole(["creator", "admin"]) && (
            <NavLink to="/admin/dashboard" className="sidebar__link" onClick={collapseSidebar}>
              <img src="/icon-painel.svg" alt="" className="sidebar__nav-icon" />
              {!collapsed && <span>Painel</span>}
            </NavLink>
          )}
        </div>

        <div className="sidebar__group">
          {categories.map((category) => (
            <NavLink
              key={category.id}
              to={`/categoria/${category.slug}`}
              className="sidebar__link"
              onClick={collapseSidebar}
            >
              <img src={getCategoryIcon(category.iconKey)} alt="" className="sidebar__category-icon" />
              {!collapsed && <span>{category.name}</span>}
            </NavLink>
          ))}
        </div>

        <button
          type="button"
          className="sidebar__profile"
          onClick={() => {
            setMessage("");
            setFormPassword("");
            setFormPhoto(null);
            setShowProfile(true);
          }}
        >
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.name} className="sidebar__avatar" />
          ) : (
            <div className="sidebar__avatar sidebar__avatar--fallback">{initials}</div>
          )}
          {!collapsed && (
            <div className="sidebar__profile-copy">
              <strong>{user?.name}</strong>
            </div>
          )}
        </button>

        <button type="button" className="sidebar__logout" onClick={handleLogout}>
          <span className="sidebar__link-icon">↩</span>
          {!collapsed && <span>Sair</span>}
        </button>
      </aside>

      {showProfile && (
        <div className="modal-backdrop" onClick={() => setShowProfile(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <h3>Editar perfil</h3>
              <button type="button" onClick={() => setShowProfile(false)}>
                x
              </button>
            </div>

            <form className="form-grid" onSubmit={handleProfileSave}>
              <label>
                <span>Nome</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Senha</span>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Deixe em branco para manter"
                />
              </label>
              <label>
                <span>Foto</span>
                <input type="file" accept="image/*" onChange={(e) => setFormPhoto(e.target.files?.[0] || null)} />
              </label>

              {message && <p className="form-message form-message--error">{message}</p>}

              <div className="form-actions">
                <button type="button" className="button button--ghost" onClick={() => setShowProfile(false)}>
                  Cancelar
                </button>
                <button type="submit" className="button">
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

export default Sidebar;
