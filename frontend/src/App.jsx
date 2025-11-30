import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Category from './pages/Category';
import Article from './pages/Article';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminNewArticle from './pages/AdminNewArticle';
import AdminEditArticle from './pages/AdminEditArticle';

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: '"Montserrat", sans-serif',
        backgroundColor: '#f3e6df',
        color: '#71594E'
      }}
    >
      <Navbar />
      <main
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          padding: '2rem 1rem'
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categoria/:categoria" element={<Category />} />
          <Route path="/artigo/:slug" element={<Article />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/artigos/novo" element={<AdminNewArticle />} />
          <Route path="/admin/artigos/:id/editar" element={<AdminEditArticle />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
