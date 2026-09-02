import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, CalendarDays, ChevronDown, ClipboardCheck, FileText, Home, LayoutDashboard, LogOut, Menu, PackageCheck, PanelLeftClose, PanelLeftOpen, Settings, Trophy } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCategoryIcon } from "../constants/categoryIcons";
import SystemNotification from "./SystemNotification";

const STORAGE_KEY = "faq_sidebar_collapsed";
const MOBILE_QUERY = "(max-width: 720px)";

function SidebarGroup({ children, label }) {
  return <section className="sidebar__group" aria-label={label}><span className="sidebar__group-title">{label}</span>{children}</section>;
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateUser, endSession, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(STORAGE_KEY) === "true");
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(() => window.location.pathname.startsWith("/categoria"));
  const [formsOpen, setFormsOpen] = useState(() => window.location.pathname.startsWith("/forms"));
  const [categories, setCategories] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [powerBiAccess, setPowerBiAccess] = useState(false);
  const [formsAccess, setFormsAccess] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, String(collapsed)); }, [collapsed]);
  useEffect(() => { if (location.pathname.startsWith("/categoria")) setKnowledgeOpen(true); }, [location.pathname]);
  useEffect(() => { if (location.pathname.startsWith("/forms")) setFormsOpen(true); }, [location.pathname]);
  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const syncMobile = (event) => { setIsMobile(event.matches); if (!event.matches) setMobileOpen(false); };
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);
  useEffect(() => {
    const loadAccess = () => api.get("/knowledge/power-bi-config").then((res) => setPowerBiAccess(res.data.enabled && res.data.hasAccess)).catch(() => setPowerBiAccess(false));
    loadAccess(); window.addEventListener("power-bi-settings-updated", loadAccess);
    return () => window.removeEventListener("power-bi-settings-updated", loadAccess);
  }, []);
  useEffect(() => {
    const loadAccess = () => api.get("/forms/access").then((res) => setFormsAccess(Boolean(res.data.hasAccess))).catch(() => setFormsAccess(false));
    loadAccess(); window.addEventListener("forms-settings-updated", loadAccess);
    return () => window.removeEventListener("forms-settings-updated", loadAccess);
  }, []);
  useEffect(() => { if (user) { setFormName(user.name || ""); setFormEmail(user.email || ""); } }, [user]);
  useEffect(() => { api.get("/knowledge/categories").then((res) => setCategories(res.data)).catch(() => setCategories([])); }, []);
  useEffect(() => {
    api.get("/knowledge/pool-settings").then((res) => setPoolEnabled(res.data.poolEnabled)).catch(() => setPoolEnabled(false));
    const update = (event) => setPoolEnabled(Boolean(event.detail?.poolEnabled));
    window.addEventListener("pool-settings-updated", update);
    return () => window.removeEventListener("pool-settings-updated", update);
  }, []);

  const initials = useMemo(() => user?.name?.split(" ").filter(Boolean).map((word) => word[0]?.toUpperCase()).join("").slice(0, 2) || "US", [user]);
  const closeNavigation = () => { if (isMobile) setMobileOpen(false); };
  const openProfile = () => { setMobileOpen(false); setMessage(""); setFormPassword(""); setFormPhoto(null); setShowProfile(true); };
  const toggleSection = (setter) => { if (!isMobile && collapsed) setCollapsed(false); setter((value) => !value); };
  const handleLogout = async () => { closeNavigation(); await logout(); navigate("/login", { replace: true }); };
  const handleProfileSave = async (event) => {
    event.preventDefault(); setMessage("");
    try {
      let photoUrl = user?.photoUrl || "";
      if (formPhoto) {
        const data = new FormData(); data.append("file", formPhoto);
        const upload = await api.post("/admin/uploads", data, { headers: { "Content-Type": "multipart/form-data" } });
        photoUrl = upload.data.url;
      }
      const payload = { name: formName, email: formEmail, photoUrl };
      if (formPassword) payload.password = formPassword;
      const response = await api.put("/admin/users/me", payload);
      if (formPassword) { setShowProfile(false); endSession("Senha alterada. Entre novamente com sua nova senha."); return; }
      updateUser(response.data); setShowProfile(false);
    } catch (error) { setMessage(error.response?.data?.error || "Não foi possível atualizar o perfil."); }
  };

  const avatar = user?.photoUrl ? <img src={user.photoUrl} alt={user.name} className="sidebar__avatar" /> : <span className="sidebar__avatar sidebar__avatar--fallback">{initials}</span>;
  const sidebarClasses = ["sidebar", collapsed && !isMobile ? "sidebar--collapsed" : "", isMobile ? "sidebar--mobile" : "", isMobile && mobileOpen ? "sidebar--mobile-open" : ""].filter(Boolean).join(" ");

  return <>
    <aside className={sidebarClasses}>
      <div className="sidebar__top">
        <Link to="/" className="sidebar__brand" onClick={closeNavigation}><span className="sidebar__brand-kicker">EMPÓRIO BROWNIE</span><strong>FAQ</strong></Link>
        <div className="sidebar__top-actions">
          {isMobile && <button type="button" className="sidebar__mobile-profile" onClick={openProfile} aria-label="Abrir perfil">{avatar}</button>}
          <button type="button" className="sidebar__toggle" onClick={() => isMobile ? setMobileOpen((value) => !value) : setCollapsed((value) => !value)} aria-label={isMobile ? (mobileOpen ? "Fechar menu" : "Abrir menu") : collapsed ? "Expandir menu" : "Recolher menu"}>{isMobile ? <Menu size={18} /> : collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>
      </div>
      <nav className="sidebar__nav" aria-label="Navegação principal">
        <SidebarGroup label="Principal"><NavLink to="/" end className="sidebar__link" onClick={closeNavigation}><Home className="sidebar__nav-icon" /><span className="sidebar__label">Início</span></NavLink></SidebarGroup>
        <SidebarGroup label="Conhecimento">
          <button type="button" className={`sidebar__link ${location.pathname.startsWith("/categoria") || location.pathname.startsWith("/artigo") ? "active" : ""}`} onClick={() => toggleSection(setKnowledgeOpen)} aria-expanded={knowledgeOpen} aria-controls="knowledge-menu"><BookOpen className="sidebar__nav-icon" /><span className="sidebar__label">Base de conhecimento</span><ChevronDown size={14} className={`sidebar__chevron ${knowledgeOpen ? "sidebar__chevron--open" : ""}`} /></button>
          {knowledgeOpen && <div id="knowledge-menu" className="sidebar__submenu">{categories.map((category) => <NavLink key={category.id} to={`/categoria/${category.slug}`} className="sidebar__submenu-link" onClick={closeNavigation}><img src={getCategoryIcon(category.iconKey)} alt="" className="sidebar__category-icon" /><span>{category.name}</span></NavLink>)}{!categories.length && <span className="sidebar__submenu-empty">Nenhuma categoria cadastrada</span>}</div>}
        </SidebarGroup>
        <SidebarGroup label="Operação">
          {hasRole(["admin", "production_manager"]) && <NavLink to="/planejamento-producao" className="sidebar__link" onClick={closeNavigation}><ClipboardCheck className="sidebar__nav-icon" /><span className="sidebar__label">Planejamento</span></NavLink>}
          {hasRole(["store", "admin", "production_manager"]) && <NavLink to="/contagem-estoque" className="sidebar__link" onClick={closeNavigation}><PackageCheck className="sidebar__nav-icon" /><span className="sidebar__label">Contagem de estoque</span></NavLink>}
          {formsAccess && <><button type="button" className={`sidebar__link ${location.pathname.startsWith("/forms") ? "active" : ""}`} onClick={() => toggleSection(setFormsOpen)} aria-expanded={formsOpen} aria-controls="forms-menu"><FileText className="sidebar__nav-icon" /><span className="sidebar__label">Formulários</span><ChevronDown size={14} className={`sidebar__chevron ${formsOpen ? "sidebar__chevron--open" : ""}`} /></button>{formsOpen && <div id="forms-menu" className="sidebar__submenu">{hasRole(["admin"]) && <NavLink to="/forms/modelos" className="sidebar__submenu-link" onClick={closeNavigation}>Modelos</NavLink>}<NavLink to="/forms/preenchimentos" className="sidebar__submenu-link" onClick={closeNavigation}>Preenchimentos</NavLink></div>}</>}
          <NavLink to="/reservas" className="sidebar__link" onClick={closeNavigation}><CalendarDays className="sidebar__nav-icon" /><span className="sidebar__label">Reservas</span></NavLink>
        </SidebarGroup>
        {powerBiAccess && <SidebarGroup label="Análises"><NavLink to="/power-bi" className="sidebar__link" onClick={closeNavigation}><BarChart3 className="sidebar__nav-icon" /><span className="sidebar__label">Power BI</span></NavLink></SidebarGroup>}
        {poolEnabled && <SidebarGroup label="Recursos"><NavLink to="/ranking-bolao" className="sidebar__link" onClick={closeNavigation}><Trophy className="sidebar__nav-icon" /><span className="sidebar__label">Ranking do Bolão</span></NavLink></SidebarGroup>}
        {hasRole(["creator", "admin"]) && <SidebarGroup label="Administração"><NavLink to="/admin/dashboard" className="sidebar__link" onClick={closeNavigation}><LayoutDashboard className="sidebar__nav-icon" /><span className="sidebar__label">Painel</span></NavLink>{hasRole(["admin"]) && <NavLink to="/admin/configuracoes" className="sidebar__link" onClick={closeNavigation}><Settings className="sidebar__nav-icon" /><span className="sidebar__label">Configurações</span></NavLink>}</SidebarGroup>}
        <div className="sidebar__spacer" />
        <div className="sidebar__footer"><button type="button" className="sidebar__profile" onClick={openProfile}>{avatar}<span className="sidebar__profile-copy"><strong>{user?.name}</strong><small>Perfil</small></span></button><button type="button" className="sidebar__logout" onClick={handleLogout}><LogOut className="sidebar__nav-icon" /><span className="sidebar__label">Sair</span></button></div>
      </nav>
    </aside>
    {isMobile && mobileOpen && <button type="button" className="sidebar__mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
    {showProfile && <div className="modal-backdrop" onClick={() => setShowProfile(false)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><div className="modal-card__header"><h3>Editar perfil</h3><button type="button" onClick={() => setShowProfile(false)}>x</button></div><form className="form-grid" onSubmit={handleProfileSave}><label><span>Nome</span><input value={formName} onChange={(event) => setFormName(event.target.value)} required /></label><label><span>Email</span><input type="email" value={formEmail} onChange={(event) => setFormEmail(event.target.value)} required /></label><label><span>Senha</span><input type="password" value={formPassword} onChange={(event) => setFormPassword(event.target.value)} placeholder="Deixe em branco para manter" /></label><label><span>Foto</span><input type="file" accept="image/*" onChange={(event) => setFormPhoto(event.target.files?.[0] || null)} /></label>{message && <SystemNotification variant="error">{message}</SystemNotification>}<div className="form-actions"><button type="button" className="button button--ghost" onClick={() => setShowProfile(false)}>Cancelar</button><button type="submit" className="button">Salvar</button></div></form></div></div>}
  </>;
}

export default Sidebar;
