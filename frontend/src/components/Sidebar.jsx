import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCategoryIcon } from "../constants/categoryIcons";

const STORAGE_KEY = "faq_sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 720px)";

function Sidebar() {
  const navigate = useNavigate();
  const { user, logout, updateUser, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);
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
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const syncMobile = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setMobileOpen(false);
      }
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

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

  const closeNavigation = () => {
    if (isMobile) {
      setMobileOpen(false);
      return;
    }
    setCollapsed(true);
  };

  const handleLogout = async () => {
    closeNavigation();
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

  const sidebarClasses = [
    "sidebar",
    collapsed && !isMobile ? "sidebar--collapsed" : "",
    isMobile ? "sidebar--mobile" : "",
    isMobile && mobileOpen ? "sidebar--mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <aside className={sidebarClasses}>
        <div className="sidebar__top">
          <Link
            to="/"
            className="sidebar__brand"
            onClick={() => {
              closeNavigation();
            }}
          >
            <strong>{isMobile ? "FAQ Empório Brownie" : "FAQ Empório Brownie"}</strong>
          </Link>

          <div className="sidebar__top-actions">
            {isMobile && (
              <button
                type="button"
                className="sidebar__mobile-profile"
                onClick={() => {
                  setMobileOpen(false);
                  setMessage("");
                  setFormPassword("");
                  setFormPhoto(null);
                  setShowProfile(true);
                }}
                aria-label="Abrir perfil"
              >
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt={user.name} className="sidebar__avatar" />
                ) : (
                  <div className="sidebar__avatar sidebar__avatar--fallback">{initials}</div>
                )}
              </button>
            )}

            <button
              type="button"
              className="sidebar__toggle"
              onClick={() => {
                if (isMobile) {
                  setMobileOpen((value) => !value);
                } else {
                  setCollapsed((value) => !value);
                }
              }}
              aria-label={isMobile ? (mobileOpen ? "Fechar menu" : "Abrir menu") : collapsed ? "Expandir menu" : "Retratar menu"}
            >
              <span className="sidebar__toggle-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>

        <div className="sidebar__nav">
          <div className="sidebar__group">
            <NavLink to="/" end className="sidebar__link" onClick={closeNavigation}>
              <img src="/icon-home.svg" alt="" className="sidebar__nav-icon" />
              {(isMobile || !collapsed) && <span>Início</span>}
            </NavLink>
            {hasRole(["creator", "admin"]) && (
              <NavLink to="/admin/dashboard" className="sidebar__link" onClick={closeNavigation}>
                <img src="/icon-painel.svg" alt="" className="sidebar__nav-icon" />
                {(isMobile || !collapsed) && <span>Painel</span>}
              </NavLink>
            )}
          </div>

          <div className="sidebar__group">
            {categories.map((category) => (
              <NavLink
                key={category.id}
                to={`/categoria/${category.slug}`}
                className="sidebar__link"
                onClick={closeNavigation}
              >
                <img src={getCategoryIcon(category.iconKey)} alt="" className="sidebar__category-icon" />
                {(isMobile || !collapsed) && <span>{category.name}</span>}
              </NavLink>
            ))}
          </div>

          {!isMobile && (
            <>
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
            </>
          )}

          {isMobile && (
            <div className="sidebar__mobile-actions">
              <button
                type="button"
                className="sidebar__link sidebar__link--button"
                onClick={() => {
                  setMobileOpen(false);
                  setMessage("");
                  setFormPassword("");
                  setFormPhoto(null);
                  setShowProfile(true);
                }}
              >
                <span className="sidebar__link-icon">👤</span>
                <span>Perfil</span>
              </button>
              <button type="button" className="sidebar__link sidebar__link--button" onClick={handleLogout}>
                <span className="sidebar__link-icon">↩</span>
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
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
