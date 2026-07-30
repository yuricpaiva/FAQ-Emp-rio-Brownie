import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import SystemNotification, { useSystemNotification } from "../components/SystemNotification";

const roleLabels = {
  reader: "Leitor",
  creator: "Criador",
  store: "Loja",
  production_manager: "Gerente de produção",
  admin: "Administrador",
};

function AdminDashboard() {
  const { confirm } = useSystemNotification();
  const { user, hasRole, endSession } = useAuth();
  const canManageUsers = hasRole(["admin"]);
  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showUserForm, setShowUserForm] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("reader");
  const [userProductionStoreId, setUserProductionStoreId] = useState("");
  const [productionStores, setProductionStores] = useState([]);
  const [userPhoto, setUserPhoto] = useState(null);
  const [userMessage, setUserMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);

  const loadArticles = async () => {
    try {
      const res = await api.get("/knowledge/articles", {
        params: {
          q: query.trim() || undefined,
          status: status || undefined,
        },
      });
      setArticles(res.data);
      setError("");
    } catch {
      setError("Não foi possível carregar artigos.");
    }
  };

  const loadUsers = async () => {
    if (!canManageUsers) return;
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch {
      setUserMessage("Não foi possível carregar usuários.");
    }
  };

  const loadProductionStores = async () => {
    if (!canManageUsers) return;
    try {
      const res = await api.get("/admin/production-stores", { params: { includeInactive: true } });
      setProductionStores(res.data || []);
    } catch {
      setUserMessage("Não foi possível carregar as lojas.");
    }
  };

  useEffect(() => {
    loadArticles();
  }, [query, status]);

  useEffect(() => {
    loadUsers();
    loadProductionStores();
  }, [canManageUsers]);

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("reader");
    setUserProductionStoreId("");
    setUserPhoto(null);
    setUserMessage("");
  };

  const articleStats = useMemo(() => {
    const published = articles.filter((article) => article.status === "published").length;
    const draft = articles.filter((article) => article.status === "draft").length;

    return [
      {
        label: "Artigos encontrados",
        value: articles.length,
        helper: "Resultado com os filtros atuais",
      },
      {
        label: "Publicados",
        value: published,
        helper: "Conteúdos visíveis para a equipe",
      },
      {
        label: "Rascunhos",
        value: draft,
        helper: "Itens ainda em preparação",
      },
      {
        label: "Usuários ativos",
        value: canManageUsers ? users.filter((user) => user.active).length : "--",
        helper: canManageUsers ? "Pessoas com acesso liberado" : "Visível para administradores",
      },
    ];
  }, [articles, canManageUsers, users]);

  const userStats = useMemo(() => {
    const activeUsers = users.filter((user) => user.active).length;
    const admins = users.filter((user) => user.role === "admin").length;

    return [
      { label: "Usuários", value: users.length },
      { label: "Ativos", value: activeUsers },
      { label: "Admins", value: admins },
    ];
  }, [users]);

  const handleDelete = async (id) => {
    if (!(await confirm("O artigo será removido permanentemente.", {
      title: "Remover artigo?",
      confirmLabel: "Remover",
    }))) return;
    try {
      await api.delete(`/admin/articles/${id}`);
      loadArticles();
    } catch {
      setError("Não foi possível remover o artigo.");
    }
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!canManageUsers) return;
    setUserMessage("");

    try {
      let successMessage = "";
      let photoUrl;
      if (userPhoto) {
        const formData = new FormData();
        formData.append("file", userPhoto);
        const upload = await api.post("/admin/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        photoUrl = upload.data.url;
      }

      const payload = {
        name: userName,
        email: userEmail,
        role: userRole,
        productionStoreId: userRole === "store" ? Number(userProductionStoreId) : null,
      };

      if (userPassword) payload.password = userPassword;
      if (photoUrl !== undefined) payload.photoUrl = photoUrl;

      if (editingUserId) {
        await api.put(`/admin/users/${editingUserId}`, payload);
        if (userPassword && editingUserId === user?.id) {
          endSession("Senha alterada. Entre novamente com sua nova senha.");
          return;
        }
        successMessage = userPassword
          ? "Senha redefinida com sucesso. Todas as sessões do usuário foram encerradas."
          : "Usuário atualizado com sucesso.";
      } else {
        await api.post("/admin/users", {
          ...payload,
          password: userPassword,
          photoUrl: photoUrl || "",
        });
        successMessage = "Usuário criado com sucesso.";
      }

      await loadUsers();
      resetUserForm();
      setUserMessage(successMessage);
    } catch (err) {
      setUserMessage(err.response?.data?.error || "Não foi possível salvar o usuário.");
    }
  };

  const handleToggleActive = async (id, active) => {
    try {
      await api.put(`/admin/users/${id}`, { active });
      await loadUsers();
      setUserMessage(
        active
          ? "Usuário reativado com sucesso."
          : "Usuário inativado com sucesso. Todas as sessões foram encerradas."
      );
    } catch {
      setUserMessage("Não foi possível atualizar o status do usuário.");
    }
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserRole(user.role || "reader");
    setUserProductionStoreId(user.productionStoreId ? String(user.productionStoreId) : "");
    setUserPassword("");
    setUserPhoto(null);
    setUserMessage("");
  };

  return (
    <section className="page-stack">
      <div className="admin-dashboard-hero">
        <div className="surface-card admin-dashboard-hero__intro">
          <p className="eyebrow">Painel</p>
          <h1>Painel de controle</h1>
          <p className="section-copy">
            Organize o acervo, acompanhe o que está publicado e acesse as ações principais sem
            precisar ficar alternando entre várias telas.
          </p>

          <div className="admin-dashboard-actions">
            <Link to="/admin/artigos/novo" className="button">
              Novo artigo
            </Link>
            {canManageUsers && (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  setShowUserForm(true);
                  resetUserForm();
                  loadUsers();
                }}
              >
                Gerenciar usuários
              </button>
            )}
            {canManageUsers && (
              <Link to="/admin/configuracoes" className="button button--ghost dashboard-settings-button">
                <img src="/icon-settings.svg" alt="" />
                Configurações
              </Link>
            )}
          </div>
        </div>

        <div className="admin-stats-grid">
          {articleStats.map((item) => (
            <div key={item.label} className="admin-stat-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.helper}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-card">
        <div className="section-heading section-heading--split">
          <div>
            <p className="eyebrow">Acervo</p>
            <h2>Artigos e publicações</h2>
            <p className="section-copy">
              Filtre o conteúdo, encontre rascunhos rapidamente e entre direto na edição do artigo.
            </p>
          </div>
        </div>

        {error && <SystemNotification variant="error">{error}</SystemNotification>}

        <div className="admin-filter-panel">
          <label className="admin-filter-field">
            <span>Buscar artigo</span>
            <input
              className="search-input"
              type="text"
              placeholder="Título, resumo, autor ou categoria"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="admin-filter-field admin-filter-field--compact">
            <span>Status</span>
            <select className="select-input" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="published">Publicados</option>
              <option value="draft">Rascunhos</option>
            </select>
          </label>
        </div>

        <div className="admin-list">
          {articles.map((article) => (
            <div key={article.id} className="admin-list__item">
              <div className="admin-list__content">
                <div className="article-list__meta admin-list__badges">
                  <span>{article.category}</span>
                  <span>{article.status === "draft" ? "Rascunho" : "Publicado"}</span>
                </div>
                <strong>{article.title}</strong>
                <p>{article.summary || "Sem resumo cadastrado."}</p>
                <div className="admin-list__meta-row">
                  <small>Ordem {article.sortOrder}</small>
                  <small>Atualizado em {new Date(article.updatedAt).toLocaleDateString("pt-BR")}</small>
                  <small>Por {article.author}</small>
                </div>
              </div>

              <div className="admin-list__actions">
                <Link to={`/admin/artigos/${article.id}/editar`} className="button button--ghost">
                  Editar
                </Link>
                <button type="button" className="button button--danger" onClick={() => handleDelete(article.id)}>
                  Remover
                </button>
              </div>
            </div>
          ))}

          {!articles.length && (
            <p className="empty-state">Nenhum artigo encontrado com os filtros atuais.</p>
          )}
        </div>
      </div>

      {showUserForm && canManageUsers && (
        <div className="modal-backdrop" onClick={() => setShowUserForm(false)}>
          <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <h3>Controle de usuários</h3>
                <p className="section-copy">
                  Gerencie acessos, permissões e cadastros sem sair do painel.
                </p>
              </div>
              <button type="button" onClick={() => setShowUserForm(false)}>
                x
              </button>
            </div>

            <div className="user-management-layout">
              <div className="user-management-panel">
                <div className="user-management-summary">
                  {userStats.map((item) => (
                    <div key={item.label} className="user-summary-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="user-grid">
                  {users.map((item) => (
                    <div key={item.id} className="user-grid__item">
                      <div className="user-grid__content">
                        <div className="user-grid__topline">
                          <strong>{item.name}</strong>
                          <span className={`user-status-pill ${item.active ? "" : "user-status-pill--inactive"}`}>
                            {item.active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <p>{item.email}</p>
                        <div className="article-list__meta">
                          <span>{roleLabels[item.role] || item.role}</span>
                          {item.productionStore?.displayName && <span>{item.productionStore.displayName}</span>}
                        </div>
                      </div>
                      <div className="admin-list__actions">
                        <button type="button" className="button button--ghost" onClick={() => handleEditUser(item)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className={item.active ? "button button--danger" : "button"}
                          onClick={() => handleToggleActive(item.id, !item.active)}
                        >
                          {item.active ? "Inativar" : "Ativar"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="user-form-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">{editingUserId ? "Edição" : "Novo cadastro"}</p>
                    <h4>{editingUserId ? "Editar usuário" : "Criar usuário"}</h4>
                  </div>
                  {editingUserId && (
                    <button type="button" className="button button--ghost" onClick={resetUserForm}>
                      Novo cadastro
                    </button>
                  )}
                </div>

                <form className="form-grid" onSubmit={handleSaveUser}>
                  <label>
                    <span>Nome</span>
                    <input value={userName} onChange={(event) => setUserName(event.target.value)} required />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(event) => setUserEmail(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Permissão</span>
                    <select
                      value={userRole}
                      onChange={(event) => {
                        const nextRole = event.target.value;
                        setUserRole(nextRole);
                        if (nextRole !== "store") setUserProductionStoreId("");
                      }}
                    >
                      <option value="reader">Leitor</option>
                      <option value="creator">Criador</option>
                      <option value="store">Loja</option>
                      <option value="production_manager">Gerente de produção</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </label>
                  {userRole === "store" && (
                    <label>
                      <span>Loja</span>
                      <select
                        value={userProductionStoreId}
                        onChange={(event) => setUserProductionStoreId(event.target.value)}
                        required
                      >
                        <option value="">Selecione a loja</option>
                        {productionStores
                          .filter((store) => store.active || store.id === Number(userProductionStoreId))
                          .map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.displayName}{store.active ? "" : " (inativa)"}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span>{editingUserId ? "Senha (opcional)" : "Senha"}</span>
                    <input
                      type="password"
                      value={userPassword}
                      onChange={(event) => setUserPassword(event.target.value)}
                      required={!editingUserId}
                    />
                  </label>
                  <label className="form-grid__full">
                    <span>Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setUserPhoto(event.target.files?.[0] || null)}
                    />
                  </label>

                  {userMessage && (
                    <SystemNotification
                      variant={userMessage.toLowerCase().includes("sucesso") ? "success" : "error"}
                    >
                      {userMessage}
                    </SystemNotification>
                  )}

                  <div className="form-actions">
                    <button type="button" className="button button--ghost" onClick={() => setShowUserForm(false)}>
                      Fechar
                    </button>
                    <button type="submit" className="button">
                      {editingUserId ? "Salvar alterações" : "Criar usuário"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default AdminDashboard;
