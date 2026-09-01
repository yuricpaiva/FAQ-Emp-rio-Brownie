import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import FormsAccessRoute from "./components/FormsAccessRoute";
import PwaManager from "./components/PwaManager";
import Sidebar from "./components/Sidebar";
import { SystemNotificationProvider } from "./components/SystemNotification";

const Home = lazy(() => import("./pages/Home"));
const Category = lazy(() => import("./pages/Category"));
const Article = lazy(() => import("./pages/Article"));
const PowerBI = lazy(() => import("./pages/PowerBI"));
const ProductionPlanning = lazy(() => import("./pages/ProductionPlanning"));
const NewProductionPlanning = lazy(() => import("./pages/NewProductionPlanning"));
const ProductionPlanningSettings = lazy(() => import("./pages/ProductionPlanningSettings"));
const StockCounts = lazy(() => import("./pages/StockCounts"));
const StockCountEntry = lazy(() => import("./pages/StockCountEntry"));
const Reservations = lazy(() => import("./pages/Reservations"));
const FormsModels = lazy(() => import("./pages/FormsModels"));
const FormModelEditor = lazy(() => import("./pages/FormModelEditor"));
const FormSubmissions = lazy(() => import("./pages/FormSubmissions"));
const FormSubmission = lazy(() => import("./pages/FormSubmission"));
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
        <Route
          path="/planejamento-producao"
          element={<ProtectedRoute roles={["admin", "production_manager"]}><ProductionPlanning /></ProtectedRoute>}
        />
        <Route
          path="/planejamento-producao/nova"
          element={<ProtectedRoute roles={["admin", "production_manager"]}><NewProductionPlanning /></ProtectedRoute>}
        />
        <Route
          path="/planejamento-producao/:day/editar"
          element={<ProtectedRoute roles={["admin", "production_manager"]}><NewProductionPlanning /></ProtectedRoute>}
        />
        <Route
          path="/planejamento-producao/configuracoes"
          element={<ProtectedRoute roles={["admin"]}><ProductionPlanningSettings /></ProtectedRoute>}
        />
        <Route
          path="/contagem-estoque"
          element={<ProtectedRoute roles={["store", "admin", "production_manager"]}><StockCounts /></ProtectedRoute>}
        />
        <Route
          path="/contagem-estoque/:id"
          element={<ProtectedRoute roles={["store", "admin", "production_manager"]}><StockCountEntry /></ProtectedRoute>}
        />
        <Route path="/ranking-bolao" element={<ProtectedRoute><PoolRanking /></ProtectedRoute>} />
        <Route path="/reservas" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
        <Route path="/forms/preenchimentos" element={<ProtectedRoute><FormsAccessRoute><FormSubmissions /></FormsAccessRoute></ProtectedRoute>} />
        <Route path="/forms/preenchimentos/:id" element={<ProtectedRoute><FormsAccessRoute><FormSubmission /></FormsAccessRoute></ProtectedRoute>} />
        <Route path="/forms/modelos" element={<ProtectedRoute roles={["admin"]}><FormsAccessRoute><FormsModels /></FormsAccessRoute></ProtectedRoute>} />
        <Route path="/forms/modelos/novo" element={<ProtectedRoute roles={["admin"]}><FormsAccessRoute><FormModelEditor /></FormsAccessRoute></ProtectedRoute>} />
        <Route path="/forms/modelos/:id/editar" element={<ProtectedRoute roles={["admin"]}><FormsAccessRoute><FormModelEditor /></FormsAccessRoute></ProtectedRoute>} />
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
  const isFullPage = ["/power-bi", "/ranking-bolao"].includes(location.pathname);

  const content = isLoginPage ? (
      <>
        <AppRoutes />
        <PwaManager />
      </>
    ) : (
    <>
      <div className="app-shell">
        <Sidebar />
        <main className={`app-shell__content ${isFullPage ? "app-shell__content--full" : ""}`}>
          <div className={`app-shell__inner ${isFullPage ? "app-shell__inner--full" : ""}`}>
            <AppRoutes />
          </div>
        </main>
      </div>
      <PwaManager />
    </>
  );

  return <SystemNotificationProvider>{content}</SystemNotificationProvider>;
}

export default App;
