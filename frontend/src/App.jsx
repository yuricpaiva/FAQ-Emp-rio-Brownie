import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Sidebar from "./components/Sidebar";

const Home = lazy(() => import("./pages/Home"));
const Category = lazy(() => import("./pages/Category"));
const Article = lazy(() => import("./pages/Article"));
const PowerBI = lazy(() => import("./pages/PowerBI"));
const PoolRanking = lazy(() => import("./pages/PoolRanking"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminNewArticle = lazy(() => import("./pages/AdminNewArticle"));
const AdminEditArticle = lazy(() => import("./pages/AdminEditArticle"));
const AdminPool = lazy(() => import("./pages/AdminPool"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));

function RouteLoader() {
  return (
    <div className="app-loader">
      <div className="app-loader__card">
        <span className="app-loader__dot" />
        <p>Carregando tela...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/categoria/:slug" element={<ProtectedRoute><Category /></ProtectedRoute>} />
        <Route path="/artigo/:slug" element={<ProtectedRoute><Article /></ProtectedRoute>} />
        <Route path="/power-bi" element={<ProtectedRoute><PowerBI /></ProtectedRoute>} />
        <Route path="/ranking-bolao" element={<ProtectedRoute><PoolRanking /></ProtectedRoute>} />
        <Route
          path="/admin/dashboard"
          element={<ProtectedRoute roles={["creator", "admin"]}><AdminDashboard /></ProtectedRoute>}
        />
        <Route
          path="/admin/artigos/novo"
          element={<ProtectedRoute roles={["creator", "admin"]}><AdminNewArticle /></ProtectedRoute>}
        />
        <Route
          path="/admin/artigos/:id/editar"
          element={<ProtectedRoute roles={["creator", "admin"]}><AdminEditArticle /></ProtectedRoute>}
        />
        <Route
          path="/admin/bolao"
          element={<ProtectedRoute roles={["admin"]}><AdminPool /></ProtectedRoute>}
        />
        <Route
          path="/admin/configuracoes"
          element={<ProtectedRoute roles={["admin"]}><AdminSettings /></ProtectedRoute>}
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login" || location.pathname === "/admin/login";
  const isPoolRankingPage = location.pathname === "/ranking-bolao";

  if (isLoginPage) {
    return <AppRoutes />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className={`app-shell__content ${isPoolRankingPage ? "app-shell__content--full" : ""}`}>
        <div className={`app-shell__inner ${isPoolRankingPage ? "app-shell__inner--full" : ""}`}>
          <AppRoutes />
        </div>
      </main>
    </div>
  );
}

export default App;
