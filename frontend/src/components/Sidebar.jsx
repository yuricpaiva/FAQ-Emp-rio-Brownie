import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, BookOpen, CalendarCheck2, CalendarDays, CalendarRange, ChevronDown, ClipboardCheck, FileText, Home, LayoutDashboard, LogOut, Menu, MessageSquareWarning, PackageCheck, PanelLeftClose, PanelLeftOpen, Settings, ShoppingCart, Trophy, Wrench } from "lucide-react";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { getCategoryIcon } from "../constants/categoryIcons";
import SystemNotification from "./SystemNotification";
import NotificationBell from "./NotificationBell";
import AccessibleDialog from "./AccessibleDialog";
import { PURCHASE_ALLOWED_ROLES } from "../constants/purchaseAccess";
import { getPurchaseAccess } from "../services/purchaseOrderService";

const MOBILE_QUERY = "(max-width: 720px)";

function initialSectionState(pathname) {
  return {
    agenda: pathname.startsWith("/eventos") || pathname.startsWith("/reservas"),
    knowledge: pathname.startsWith("/categoria") || pathname.startsWith("/artigo"),
    operations: ["/planejamento-producao", "/contagem-estoque", "/forms", "/compras", "/sac", "/reservas-mesas"].some((path) => pathname.startsWith(path)),
    management: pathname.startsWith("/power-bi") || pathname.startsWith("/ranking-bolao") || pathname.startsWith("/admin"),
  };
}

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateUser, endSession, hasRole } = useAuth();
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const toggleRef = useRef(null);
  const wasMobileOpen = useRef(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [desktopCollapseOverride, setDesktopCollapseOverride] = useState(null);
  const [sections, setSections] = useState(() => initialSectionState(window.location.pathname));
  const [categories, setCategories] = useState([]);
  const [poolEnabled, setPoolEnabled] = useState(false);
  const [powerBiAccess, setPowerBiAccess] = useState(false);
  const [formsAccess, setFormsAccess] = useState(false);
  const [purchasesAccess, setPurchasesAccess] = useState(false);
  const [sacAccess, setSacAccess] = useState(false);
  const [tableReservationsAccess, setTableReservationsAccess] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhoto, setFormPhoto] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isMobile) setNavigationOpen(false);
    setSections((current) => ({ ...current, ...initialSectionState(location.pathname) }));
  }, [isMobile, location.key, location.pathname, location.search, location.hash]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const syncMobile = (event) => {
      setIsMobile(event.matches);
      setNavigationOpen(false);
    };
    mediaQuery.addEventListener("change", syncMobile);
    return () => mediaQuery.removeEventListener("change", syncMobile);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || !isMobile) return undefined;
    if (navigationOpen) {
      nav.removeAttribute("inert");
      window.requestAnimationFrame(() => nav.querySelector("a, button")?.focus());
    } else {
      nav.setAttribute("inert", "");
      if (wasMobileOpen.current) toggleRef.current?.focus();
    }
    wasMobileOpen.current = navigationOpen;
    return undefined;
  }, [isMobile, navigationOpen]);

  useEffect(() => {
    if (!navigationOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (isMobile && sidebarRef.current && !sidebarRef.current.contains(event.target)) setNavigationOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === "Escape") setNavigationOpen(false); };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobile, navigationOpen]);

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
  useEffect(() => {
    const loadAccess = () => getPurchaseAccess().then((result) => setPurchasesAccess(Boolean(result.hasAccess))).catch(() => setPurchasesAccess(false));
    loadAccess(); window.addEventListener("purchase-settings-updated", loadAccess);
    return () => window.removeEventListener("purchase-settings-updated", loadAccess);
  }, [user?.id, user?.role]);
  useEffect(() => {
    const loadAccess = () => api.get("/sac/access").then((response) => setSacAccess(Boolean(response.data.hasAccess))).catch(() => setSacAccess(false));
    loadAccess(); window.addEventListener("sac-settings-updated", loadAccess);
    return () => window.removeEventListener("sac-settings-updated", loadAccess);
  }, [user?.id, user?.role]);
  useEffect(() => {
    const loadAccess = () => api.get("/table-reservations/access").then((response) => setTableReservationsAccess(Boolean(response.data.hasAccess))).catch(() => setTableReservationsAccess(false));
    loadAccess(); window.addEventListener("table-reservations-settings-updated", loadAccess);
    return () => window.removeEventListener("table-reservations-settings-updated", loadAccess);
  }, [user?.id, user?.role]);
  useEffect(() => { if (user) { setFormName(user.name || ""); setFormEmail(user.email || ""); } }, [user]);
  useEffect(() => { api.get("/knowledge/categories").then((res) => setCategories(res.data)).catch(() => setCategories([])); }, []);
  useEffect(() => {
    api.get("/knowledge/pool-settings").then((res) => setPoolEnabled(res.data.poolEnabled)).catch(() => setPoolEnabled(false));
    const update = (event) => setPoolEnabled(Boolean(event.detail?.poolEnabled));
    window.addEventListener("pool-settings-updated", update);
    return () => window.removeEventListener("pool-settings-updated", update);
  }, []);

  const initials = useMemo(() => user?.name?.split(" ").filter(Boolean).map((word) => word[0]?.toUpperCase()).join("").slice(0, 2) || "US", [user]);
  const closeNavigation = () => { if (isMobile) setNavigationOpen(false); };
  const openProfile = () => { closeNavigation(); setMessage(""); setFormPassword(""); setFormPhoto(null); setShowProfile(true); };
  const closeProfile = useCallback(() => setShowProfile(false), []);
  const toggleSection = (name) => {
    setSections((current) => ({ ...current, [name]: !current[name] }));
  };
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
    } catch (error) { setMessage(error.response?.data?.error || "Não foi possível atualizar o perfil. Tente novamente."); }
  };

  const avatar = user?.photoUrl ? <img src={user.photoUrl} alt="" className="sidebar__avatar" /> : <span className="sidebar__avatar sidebar__avatar--fallback" aria-hidden="true">{initials}</span>;
  const isPowerBiRoute = location.pathname === "/power-bi";
  const isCollapsed = !isMobile && (desktopCollapseOverride ?? isPowerBiRoute);
  const sidebarClasses = ["sidebar", isMobile ? "sidebar--mobile" : "", isMobile && navigationOpen ? "sidebar--mobile-open" : "", isCollapsed ? "sidebar--collapsed" : ""].filter(Boolean).join(" ");
  const operationActive = ["/planejamento-producao", "/contagem-estoque", "/forms", "/compras", "/sac", "/reservas-mesas"].some((path) => location.pathname.startsWith(path));
  const managementVisible = powerBiAccess || poolEnabled || hasRole(["creator", "admin"]);

  const handleSidebarToggle = () => setDesktopCollapseOverride(!isCollapsed);
  const handleSectionToggle = (name) => {
    if (isCollapsed) {
      setDesktopCollapseOverride(false);
      setSections((current) => ({ ...current, [name]: true }));
      return;
    }
    toggleSection(name);
  };

  const sectionButton = (name, label, Icon, active = false) => (
    <button type="button" className={`sidebar__link ${active ? "active" : ""}`} onClick={() => handleSectionToggle(name)} aria-expanded={!isCollapsed && sections[name]} aria-controls={`${name}-menu`} aria-label={label} title={isCollapsed ? label : undefined} data-tooltip={label}>
      <Icon className="sidebar__nav-icon" aria-hidden="true" /><span className="sidebar__label">{label}</span><ChevronDown size={14} className={`sidebar__chevron ${sections[name] ? "sidebar__chevron--open" : ""}`} aria-hidden="true" />
    </button>
  );
  const sectionMenu = (name, content) => {
    const menuVisible = sections[name] && !isCollapsed;
    return (
      <div
        id={`${name}-menu`}
        className={`sidebar__submenu-shell ${menuVisible ? "sidebar__submenu-shell--open" : ""}`}
        aria-hidden={!menuVisible}
        inert={!menuVisible ? "" : undefined}
      >
        <div className="sidebar__submenu">{content}</div>
      </div>
    );
  };

  return <>
    <aside ref={sidebarRef} className={sidebarClasses}>
      <div className="sidebar__top">
        <Link to="/" className="sidebar__brand" onClick={closeNavigation}><span className="sidebar__brand-kicker">EMPÓRIO BROWNIE</span><strong>FAQ</strong></Link>
        {!isMobile && <button type="button" className="sidebar__collapse-toggle" onClick={handleSidebarToggle} aria-expanded={!isCollapsed} aria-controls="sidebar-navigation" aria-label={isCollapsed ? "Expandir barra lateral" : "Retrair barra lateral"} title={isCollapsed ? "Expandir barra lateral" : "Retrair barra lateral"}>{isCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}</button>}
        {isMobile && <div className="sidebar__top-actions"><NotificationBell /><button type="button" className="sidebar__mobile-profile" onClick={openProfile} aria-label="Abrir perfil">{avatar}</button><button ref={toggleRef} type="button" className="sidebar__toggle" onClick={() => setNavigationOpen((value) => !value)} aria-expanded={navigationOpen} aria-controls="sidebar-navigation" aria-label={navigationOpen ? "Fechar menu" : "Abrir menu"}><Menu size={20} /></button></div>}
      </div>

      <nav ref={navRef} id="sidebar-navigation" className="sidebar__nav" aria-label="Navegação principal" aria-hidden={isMobile && !navigationOpen ? "true" : undefined}>
        <div className="sidebar__group sidebar__group--primary">
          <NavLink to="/" end className="sidebar__link" onClick={closeNavigation} aria-label="Início" title={isCollapsed ? "Início" : undefined} data-tooltip="Início"><Home className="sidebar__nav-icon" aria-hidden="true" /><span className="sidebar__label">Início</span></NavLink>
          <NavLink to="/assistente" className="sidebar__link" onClick={closeNavigation} aria-label="Browninho" title={isCollapsed ? "Browninho" : undefined} data-tooltip="Browninho"><span className="sidebar__nav-icon sidebar__browninho-icon" aria-hidden="true" /><span className="sidebar__label">Browninho</span></NavLink>
        </div>
        <div className="sidebar__group">
          {sectionButton("agenda", "Agenda", CalendarRange, location.pathname.startsWith("/eventos") || location.pathname.startsWith("/reservas"))}
          {sectionMenu("agenda", <><NavLink to="/eventos" className="sidebar__submenu-link" onClick={closeNavigation}><CalendarDays size={15} aria-hidden="true" /><span>Eventos da empresa</span></NavLink><NavLink to="/reservas" className="sidebar__submenu-link" onClick={closeNavigation}><CalendarRange size={15} aria-hidden="true" /><span>Reservas de recursos</span></NavLink></>)}
          {sectionButton("knowledge", "Conhecimento", BookOpen, location.pathname.startsWith("/categoria") || location.pathname.startsWith("/artigo"))}
          {sectionMenu("knowledge", <>{categories.map((category) => <NavLink key={category.id} to={`/categoria/${category.slug}`} className="sidebar__submenu-link" onClick={closeNavigation}><img src={getCategoryIcon(category.iconKey)} alt="" className="sidebar__category-icon" /><span>{category.name}</span></NavLink>)}{!categories.length && <span className="sidebar__submenu-empty">Nenhuma categoria disponível</span>}</>)}
          {sectionButton("operations", "Operações", Wrench, operationActive)}
          {sectionMenu("operations", <>
            {hasRole(["admin", "production_manager"]) && <NavLink to="/planejamento-producao" className="sidebar__submenu-link" onClick={closeNavigation}><ClipboardCheck size={15} aria-hidden="true" /><span>Planejamento</span></NavLink>}
            {hasRole(["store", "admin", "production_manager"]) && <NavLink to="/contagem-estoque" className="sidebar__submenu-link" onClick={closeNavigation}><PackageCheck size={15} aria-hidden="true" /><span>Contagem de estoque</span></NavLink>}
            {formsAccess && <><NavLink to="/forms/preenchimentos" className="sidebar__submenu-link" onClick={closeNavigation}><FileText size={15} aria-hidden="true" /><span>Preenchimentos</span></NavLink>{hasRole(["admin"]) && <NavLink to="/forms/modelos" className="sidebar__submenu-link" onClick={closeNavigation}><FileText size={15} aria-hidden="true" /><span>Modelos de formulário</span></NavLink>}</>}
            {hasRole(PURCHASE_ALLOWED_ROLES) && purchasesAccess && <NavLink to="/compras/pedidos" className="sidebar__submenu-link" onClick={closeNavigation}><ShoppingCart size={15} aria-hidden="true" /><span>Pedidos de compra</span></NavLink>}
            {sacAccess && <NavLink to="/sac/reclamacoes" className="sidebar__submenu-link" onClick={closeNavigation}><MessageSquareWarning size={15} aria-hidden="true" /><span>Reclamações do SAC</span></NavLink>}
            {tableReservationsAccess && <NavLink to="/reservas-mesas" className="sidebar__submenu-link" onClick={closeNavigation}><CalendarCheck2 size={15} aria-hidden="true" /><span>Central de Reservas</span></NavLink>}
          </>)}
          {managementVisible && <>{sectionButton("management", "Gestão", Settings, location.pathname.startsWith("/power-bi") || location.pathname.startsWith("/ranking-bolao") || location.pathname.startsWith("/admin"))}{sectionMenu("management", <>
            {powerBiAccess && <NavLink to="/power-bi" className="sidebar__submenu-link" onClick={closeNavigation}><BarChart3 size={15} aria-hidden="true" /><span>Power BI</span></NavLink>}
            {poolEnabled && <NavLink to="/ranking-bolao" className="sidebar__submenu-link" onClick={closeNavigation}><Trophy size={15} aria-hidden="true" /><span>Ranking do Bolão</span></NavLink>}
            {hasRole(["creator", "admin"]) && <NavLink to="/admin/dashboard" className="sidebar__submenu-link" onClick={closeNavigation}><LayoutDashboard size={15} aria-hidden="true" /><span>Painel de conteúdo</span></NavLink>}
            {hasRole(["admin"]) && <NavLink to="/admin/configuracoes" className="sidebar__submenu-link" onClick={closeNavigation}><Settings size={15} aria-hidden="true" /><span>Configurações</span></NavLink>}
          </>)}</>}
        </div>
        <div className="sidebar__spacer" />
        <div className="sidebar__footer">{!isMobile && <div title={isCollapsed ? "Notificações" : undefined}><NotificationBell variant="navigation" /></div>}<button type="button" className="sidebar__profile" onClick={openProfile} aria-label={`Editar perfil de ${user?.name || "usuário"}`} title={isCollapsed ? "Editar perfil" : undefined}>{avatar}<span className="sidebar__profile-copy"><strong>{user?.name}</strong><small>Editar perfil</small></span></button><button type="button" className="sidebar__logout" onClick={handleLogout} aria-label="Sair" title={isCollapsed ? "Sair" : undefined}><LogOut className="sidebar__nav-icon" aria-hidden="true" /><span className="sidebar__label">Sair</span></button></div>
      </nav>
    </aside>
    {isMobile && navigationOpen && <button type="button" className="sidebar__mobile-overlay" onClick={closeNavigation} aria-label="Fechar menu" />}
    {showProfile && <AccessibleDialog labelId="profile-dialog-title" onClose={closeProfile}><div className="modal-card__header"><h2 id="profile-dialog-title">Editar perfil</h2><button type="button" onClick={closeProfile} aria-label="Fechar edição do perfil">×</button></div><form className="form-grid" onSubmit={handleProfileSave}><label><span>Nome</span><input value={formName} onChange={(event) => setFormName(event.target.value)} maxLength={120} required /></label><label><span>E-mail</span><input type="email" value={formEmail} onChange={(event) => setFormEmail(event.target.value)} required /></label><label><span>Nova senha</span><input type="password" value={formPassword} onChange={(event) => setFormPassword(event.target.value)} placeholder="Deixe em branco para manter" autoComplete="new-password" /></label><label><span>Foto do perfil</span><input type="file" accept="image/*" onChange={(event) => setFormPhoto(event.target.files?.[0] || null)} /></label>{message && <SystemNotification variant="error">{message}</SystemNotification>}<div className="form-actions"><button type="button" className="button button--ghost" onClick={closeProfile}>Cancelar</button><button type="submit" className="button">Salvar perfil</button></div></form></AccessibleDialog>}
  </>;
}

export default Sidebar;
