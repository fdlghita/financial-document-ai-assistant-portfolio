import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import "./styles/theme.css";
import "./components/layout/Sidebar.css";
import "./components/layout/Header.css";
import "./pages/DashboardPage.css";
import "./pages/AIPage.css";
import "./pages/DocumentsPage.css";

import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

import DashboardPage from "./pages/DashboardPage";
import AIPage from "./pages/AIPage";
import DocumentsPage from "./pages/DocumentsPage";

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const apiBase =
    process.env.REACT_APP_API_BASE ||
    "http://127.0.0.1:8000";

  const routeToPage = {
    "/dashboard": "dashboard",
    "/assistant": "ai",
    "/documents": "documents",
  };

  const pageToRoute = {
    dashboard: "/dashboard",
    ai: "/assistant",
    documents: "/documents",
  };

  const activePage = routeToPage[location.pathname] || "dashboard";

  const setActivePage = (page, options) => {
    navigate(pageToRoute[page] || "/dashboard", options);
  };

  return (
    <div className="v2-shell">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main className="v2-main">
        <Header activePage={activePage} />

        <section className="v2-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={<DashboardPage setActivePage={setActivePage} apiBase={apiBase} />}
            />
            <Route path="/assistant" element={<AIPage apiBase={apiBase} />} />
            <Route
              path="/documents"
              element={<DocumentsPage setActivePage={setActivePage} apiBase={apiBase} />}
            />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </section>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter >
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;