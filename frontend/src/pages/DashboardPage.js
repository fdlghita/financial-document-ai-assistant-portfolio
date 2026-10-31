import { useEffect, useMemo, useState } from "react";
import { Bot, FileText, MessageSquare } from "lucide-react";
import { listChats, listDocuments } from "../services/api";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function DashboardPage({ setActivePage, apiBase }) {
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setChatsLoading(true);
    listChats(apiBase)
      .then((data) => {
        if (!cancelled) {
          setChats(Array.isArray(data) ? data : []);
          setChatsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setChatsError(true);
      })
      .finally(() => {
        if (!cancelled) setChatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    setDocsLoading(true);
    listDocuments(apiBase)
      .then((data) => {
        if (!cancelled) {
          setDocuments(Array.isArray(data) ? data : []);
          setDocsError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDocsError(true);
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const recentDocuments = useMemo(() => documents.slice(0, 4), [documents]);

  const recentChats = useMemo(() => chats.slice(0, 4), [chats]);

  const totalChunks = useMemo(
    () => documents.reduce((sum, doc) => sum + (doc.chunks_created || 0), 0),
    [documents]
  );

  const stats = [
    { label: "Documents indexés", value: String(documents.length) },
    { label: "Chunks indexés", value: totalChunks.toLocaleString("fr-FR") },
    { label: "Conversations IA", value: String(chats.length) },
  ];

  const modules = [
    {
      title: "Assistant IA",
      description: "Upload PDFs and ask a local AI assistant to summarize and analyze documents.",
      action: "Ouvrir IA",
      page: "ai",
      icon: Bot,
    },
  ];

  return (
    <div className="dashboard-page">
      <section className="v2-card dashboard-hero">
        <div>
          <span className="v2-pill">Document intelligence</span>
          <h2>Financial Document AI Assistant</h2>
          <div className="dashboard-actions">
            <button className="v2-primary-button" onClick={() => setActivePage("ai")}>
              Assistant IA
            </button>
            <button
              className="v2-secondary-button"
              onClick={() => setActivePage("documents", { state: { openPanel: "translate" } })}
            >
              Traduire un document
            </button>
          </div>
        </div>
      </section>

      <div className="v2-grid v2-grid-3 dashboard-stats">
        {stats.map((item) => (
          <div className="v2-card v2-card-padding stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="v2-grid dashboard-recent-grid">
        <section className="v2-card v2-card-padding recent-card">
          <div className="recent-card-header">
            <FileText size={18} strokeWidth={1.75} />
            <h3>Documents récents</h3>
          </div>
          {docsLoading && <div className="v2-loading-state">Chargement des documents...</div>}
          {!docsLoading && docsError && (
            <div className="v2-empty-state">Impossible de récupérer les documents pour le moment.</div>
          )}
          {!docsLoading && !docsError && recentDocuments.length === 0 && (
            <div className="v2-empty-state">Aucun document indexé pour le moment.</div>
          )}
          {!docsLoading && !docsError && recentDocuments.length > 0 && (
            <div className="recent-list">
              {recentDocuments.map((doc) => (
                <div className="recent-item" key={doc.id} onClick={() => setActivePage("documents")}>
                  <div>
                    <strong>{doc.filename}</strong>
                    <span className="recent-item-meta">{doc.chunks_created} chunks indexés</span>
                  </div>
                  <span className="recent-item-date">{formatDate(doc.uploaded_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="v2-card v2-card-padding recent-card">
          <div className="recent-card-header">
            <MessageSquare size={18} strokeWidth={1.75} />
            <h3>Analyses IA récentes</h3>
          </div>
          {chatsLoading && <div className="v2-loading-state">Chargement des conversations...</div>}
          {!chatsLoading && chatsError && (
            <div className="v2-empty-state">Impossible de récupérer les conversations pour le moment.</div>
          )}
          {!chatsLoading && !chatsError && recentChats.length === 0 && (
            <div className="v2-empty-state">Aucune analyse IA enregistrée pour le moment.</div>
          )}
          {!chatsLoading && !chatsError && recentChats.length > 0 && (
            <div className="recent-list">
              {recentChats.map((chat) => (
                <div
                  className="recent-item"
                  key={chat.id}
                  onClick={() => setActivePage("ai", { state: { chatId: chat.id } })}
                >
                  <div>
                    <strong>{chat.title}</strong>
                    <span className="recent-item-meta">{(chat.messages || []).length} messages</span>
                  </div>
                  <span className="recent-item-date">{formatDate(chat.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="v2-grid v2-grid-3 dashboard-modules">
        {modules.map((module) => (
          <div className="v2-card v2-card-padding module-card" key={module.title}>
            <div className="module-icon">
              <module.icon size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <button className="v2-secondary-button" onClick={() => setActivePage(module.page)}>
                {module.action}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
