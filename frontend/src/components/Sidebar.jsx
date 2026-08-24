import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCategoryIcon } from "../constants/categoryIcons";
import SystemNotification from "./SystemNotification";

const STORAGE_KEY = "faq_sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 720px)";

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateUser, endSession, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(() => window.location.pathname.startsWith("/categoria"));
  const [categories, setCategories] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [powerBiAccess, setPowerBiAccess] = useState(false);
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
    if (location.pathname.startsWith("/categoria")) {
      setKnowledgeOpen(true);
    }
  }, [location.pathname]);

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
    const loadPowerBiAccess = () => {
      api
        .get("/knowledge/power-bi-config")
        .then((res) => setPowerBiAccess(res.data.enabled && res.data.hasAccess))
        .catch(() => setPowerBiAccess(false));
    };

    loadPowerBiAccess();
    window.addEventListener("power-bi-settings-updated", loadPowerBiAccess);
    return () => window.removeEventListener("power-bi-settings-updated", loadPowerBiAccess);
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

  useEffect(() => {
    api
      .get("/knowledge/pool-settings")
      .then((res) => setPoolEnabled(res.data.poolEnabled))
      .catch(() => setPoolEnabled(false));

    const handlePoolSettingsUpdate = (event) => {
      setPoolEnabled(Boolean(event.detail?.poolEnabled));
    };
    window.addEventListener("pool-settings-updated", handlePoolSettingsUpdate);
    return () => window.removeEventListener("pool-settings-updated", handlePoolSettingsUpdate);
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

  const handleKnowledgeToggle = () => {
    if (!isMobile && collapsed) {
      setCollapsed(false);
    }
    setKnowledgeOpen((value) => !value);
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
      if (formPassword) {
        setShowProfile(false);
        endSession("Senha alterada. Entre novamente com sua nova senha.");
        return;
      }
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
            <strong>FAQ EB</strong>
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
            <NavLink to="/" end className="sidebar__link" onClick={closeNavigation} aria-label="Início">
              <img src="/icon-home.svg" alt="" className="sidebar__nav-icon" />
              <span className="sidebar__label">Início</span>
            </NavLink>
            {powerBiAccess && (
              <NavLink to="/power-bi" className="sidebar__link" onClick={closeNavigation} aria-label="Power BI">
                <img src="/icon-power-bi.svg" alt="" className="sidebar__nav-icon" />
                <span className="sidebar__label">Power BI</span>
              </NavLink>
            )}
            {hasRole(["admin", "production_manager"]) && (
              <NavLink
                to="/planejamento-producao"
                className="sidebar__link"
                onClick={closeNavigation}
                aria-label="Planejamento de Produção"
              >
                <img src="/icon-producao-expedicao.svg" alt="" className="sidebar__nav-icon" />
                <span className="sidebar__label">Planejamento de Produção</span>
              </NavLink>
            )}
            {hasRole(["store", "admin", "production_manager"]) && (
              <NavLink
                to="/contagem-estoque"
                className="sidebar__link"
                onClick={closeNavigation}
                aria-label="Contagem de Estoque"
              >
                <img src="/icon-operacao.svg" alt="" className="sidebar__nav-icon" />
                <span className="sidebar__label">Contagem de Estoque</span>
              </NavLink>
            )}
            {poolEnabled && (
              <NavLink
                to="/ranking-bolao"
                className="sidebar__link"
                onClick={closeNavigation}
                aria-label="Ranking do Bolão"
              >
                <img src="/icon-ranking.svg" alt="" className="sidebar__nav-icon" />
                <span className="sidebar__label">Ranking do Bolão</span>
              </NavLink>
            )}
            <NavLink to="/reservas" className="sidebar__link" onClick={closeNavigation} aria-label="Reservas">
              <img src="/icon-reservas.svg" alt="" className="sidebar__nav-icon" />
              <span className="sidebar__label">Reservas</span>
            </NavLink>
            {hasRole(["creator", "admin"]) && (
              <NavLink
                to="/admin/dashboard"
                className="sidebar__link"
                onClick={closeNavigation}
                aria-label="Painel"
              >
                <img src="/icon-painel.svg" alt="" className="sidebar__nav-icon" />
                <span className="sidebar__label">Painel</span>
              </NavLink>
            )}
          </div>

          <div className="sidebar__group">
            <button
              type="button"
              className={`sidebar__link sidebar__link--button sidebar__knowledge-trigger ${
                location.pathname.startsWith("/categoria") ? "active" : ""
              }`}
              onClick={handleKnowledgeToggle}
              aria-expanded={knowledgeOpen}
              aria-controls="knowledge-menu"
              aria-label="Base de conhecimento"
            >
              <img src="/icon-base-conhecimento.svg" alt="" className="sidebar__nav-icon" />
              <span className="sidebar__label">Base de conhecimento</span>
              <span
                className={`sidebar__chevron ${knowledgeOpen ? "sidebar__chevron--open" : ""}`}
                aria-hidden="true"
              >
                v
              </span>
            </button>

            {knowledgeOpen && (
              <div
                id="knowledge-menu"
                className="sidebar__submenu"
                aria-hidden={!isMobile && collapsed}
                inert={!isMobile && collapsed ? "" : undefined}
              >
                {categories.map((category) => (
                  <NavLink
                    key={category.id}
                    to={`/categoria/${category.slug}`}
                    className="sidebar__submenu-link"
                    onClick={closeNavigation}
                  >
                    <img src={getCategoryIcon(category.iconKey)} alt="" className="sidebar__category-icon" />
                    <span>{category.name}</span>
                  </NavLink>
                ))}
                {!categories.length && <span className="sidebar__submenu-empty">Nenhuma categoria cadastrada</span>}
              </div>
            )}
          </div>

          {!isMobile && (
            <>
              <button
                type="button"
                className="sidebar__profile"
                aria-label="Editar perfil"
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
                <div className="sidebar__profile-copy">
                  <strong>{user?.name}</strong>
                </div>
              </button>

              <button type="button" className="sidebar__logout" onClick={handleLogout} aria-label="Sair">
                <span className="sidebar__link-icon">↩</span>
                <span className="sidebar__label">Sair</span>
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

              {message && <SystemNotification variant="error">{message}</SystemNotification>}

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
