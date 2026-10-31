import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import ChatComponent from "../components/ChatComponent";
import UploadComponent from "../components/UploadComponent";
import { listChats, createChat, updateChat, deleteChat, listDocuments } from "../services/api";

const defaultAssistantMessage = {
  role: "assistant",
  content:
    "Hello! Upload a PDF or ask me a question about your indexed documents.",
};

function formatConversationDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function AIPage({ apiBase }) {
  const location = useLocation();
  const [messages, setMessages] = useState([defaultAssistantMessage]);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [documentSource, setDocumentSource] = useState("");
  const titleSetRef = useRef(false);
  const deepLinkHandled = useRef(false);
  const documentDeepLinkHandled = useRef(false);

  const prompts = [
    "Summarize this document in five bullet points.",
    "Extract the key facts and figures.",
    "What risks or limitations are mentioned?",
    "Write a concise executive summary.",
  ];

  useEffect(() => {
    let cancelled = false;
    listChats(apiBase)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setConversations(list);

        const chatId = location.state?.chatId;
        if (chatId && !deepLinkHandled.current) {
          deepLinkHandled.current = true;
          const found = list.find((chat) => chat.id === chatId);
          if (found) {
            setActiveChatId(found.id);
            setMessages(found.messages && found.messages.length ? found.messages : [defaultAssistantMessage]);
            titleSetRef.current = true;
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    listDocuments(apiBase)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setDocuments(list);

        const docSource = location.state?.documentSource;
        if (docSource && !documentDeepLinkHandled.current) {
          documentDeepLinkHandled.current = true;
          if (list.some((doc) => doc.filename === docSource)) {
            setDocumentSource(docSource);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!activeChatId) return undefined;
    const timer = setTimeout(() => {
      updateChat(activeChatId, { messages }, apiBase)
        .then((updated) => {
          setConversations((prev) => [updated, ...prev.filter((c) => c.id !== activeChatId)]);
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [messages, activeChatId, apiBase]);

  const handleFirstMessage = (text) => {
    if (!activeChatId) {
      createChat(undefined, apiBase)
        .then((chat) => {
          setActiveChatId(chat.id);
          titleSetRef.current = true;
          return updateChat(chat.id, { title: text.slice(0, 60) }, apiBase);
        })
        .then((updated) => {
          if (updated) {
            setConversations((prev) => [updated, ...prev.filter((c) => c.id !== updated.id)]);
          }
        })
        .catch(() => {});
    } else if (!titleSetRef.current) {
      titleSetRef.current = true;
      updateChat(activeChatId, { title: text.slice(0, 60) }, apiBase)
        .then((updated) => {
          setConversations((prev) => [updated, ...prev.filter((c) => c.id !== updated.id)]);
        })
        .catch(() => {});
    }
  };

  const selectConversation = (chat) => {
    if (chat.id === activeChatId) return;
    setActiveChatId(chat.id);
    setMessages(chat.messages && chat.messages.length ? chat.messages : [defaultAssistantMessage]);
    titleSetRef.current = true;
  };

  const startNewConversation = () => {
    setActiveChatId(null);
    setMessages([defaultAssistantMessage]);
    titleSetRef.current = false;
  };

  const handleDeleteConversation = (chatId, event) => {
    event.stopPropagation();
    if (!window.confirm("Supprimer cette conversation ?")) return;
    deleteChat(chatId, apiBase)
      .then(() => {
        setConversations((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) {
          startNewConversation();
        }
      })
      .catch(() => {});
  };

  return (
    <div className="ai-page">
      <div className="v2-grid ai-layout">
        <section className="v2-card v2-card-padding ai-chat-panel">
          <ChatComponent
            key={activeChatId || "draft"}
            apiBase={apiBase}
            messages={messages}
            setMessages={setMessages}
            onTitleChange={handleFirstMessage}
            draftPrompt={draftPrompt}
            companyContext=""
            documentSource={documentSource || undefined}
          />
        </section>

        <aside className="v2-grid ai-side-panel">
          <section className="v2-card v2-card-padding ai-history-panel">
            <div className="ai-history-header">
              <span className="v2-pill">Conversations</span>
              <button type="button" className="ai-history-new" onClick={startNewConversation}>
                <Plus size={15} strokeWidth={1.75} />
                Nouvelle conversation
              </button>
            </div>

            {historyLoading && <div className="v2-loading-state">Chargement...</div>}

            {!historyLoading && conversations.length === 0 && (
              <div className="v2-empty-state">Aucune conversation enregistrée pour le moment.</div>
            )}

            {!historyLoading && conversations.length > 0 && (
              <div className="ai-history-list">
                {conversations.map((chat) => (
                  <div
                    key={chat.id}
                    className={`ai-history-item ${chat.id === activeChatId ? "active" : ""}`}
                    onClick={() => selectConversation(chat)}
                  >
                    <MessageSquare size={15} strokeWidth={1.75} />
                    <div className="ai-history-item-body">
                      <span className="ai-history-item-title">{chat.title}</span>
                      <span className="ai-history-item-date">{formatConversationDate(chat.updated_at)}</span>
                    </div>
                    <button
                      type="button"
                      className="ai-history-delete"
                      title="Supprimer"
                      onClick={(event) => handleDeleteConversation(chat.id, event)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="v2-card v2-card-padding">
            <span className="v2-pill">Document actif</span>
            <h3>Portée de la recherche</h3>
            <select
              className="ai-document-select"
              value={documentSource}
              onChange={(event) => setDocumentSource(event.target.value)}
            >
              <option value="">Tous les documents</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.filename}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </section>

          <section className="v2-card v2-card-padding">
            <span className="v2-pill">Prompts rapides</span>
            <h3>Questions prêtes à l’emploi</h3>
            <div className="ai-prompt-list">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="ai-prompt-button"
                  onClick={() => setDraftPrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          <section className="v2-card v2-card-padding">
            <span className="v2-pill">Contexte documentaire</span>
            <UploadComponent apiBase={apiBase} />
          </section>
        </aside>
      </div>
    </div>
  );
}

export default AIPage;
