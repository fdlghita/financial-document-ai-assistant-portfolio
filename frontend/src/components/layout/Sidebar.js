import {
  LayoutDashboard,
  Bot,
  FolderOpen,
} from "lucide-react";

const items = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "ai", label: "AI Assistant", icon: Bot },
  { id: "documents", label: "Documents", icon: FolderOpen },
];

function Sidebar({ activePage, setActivePage }) {
  return (
    <aside className="v2-sidebar">
      <div className="v2-sidebar-brand">
        <div className="v2-brand-mark">
          <Bot size={28} aria-label="AI assistant" />
        </div>
        <div>
          <div className="v2-brand-title">AI Workspace</div>
          <div className="v2-brand-subtitle">Financial Document AI</div>
        </div>
      </div>

      <nav className="v2-sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`v2-sidebar-link ${activePage === item.id ? "active" : ""}`}
            onClick={() => setActivePage(item.id)}
          >
            <item.icon size={18} strokeWidth={1.75} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="v2-sidebar-footer">
        <span className="v2-pill">Local-first research toolkit</span>
        <p>React + FastAPI + OCR + RAG</p>
      </div>
    </aside>
  );
}

export default Sidebar;