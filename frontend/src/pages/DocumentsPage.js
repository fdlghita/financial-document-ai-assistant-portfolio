import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Search, Eye, Bot, Trash2, CheckCircle2, Plus, X, Languages } from "lucide-react";
import { listDocuments, deleteDocument } from "../services/api";
import UploadComponent from "../components/UploadComponent";
import DocumentTranslateComponent from "../components/DocumentTranslateComponent";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatStatus(status) {
  if (status === "indexed") return "Indexé";
  return status;
}

function DocumentsPage({ setActivePage, apiBase }) {
  const location = useLocation();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [activePanel, setActivePanel] = useState(location.state?.openPanel || null);

  const togglePanel = (panel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const refreshDocuments = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listDocuments(apiBase)
      .then((data) => {
        if (!cancelled) {
          setDocuments(Array.isArray(data) ? data : []);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    const cancel = refreshDocuments();
    return cancel;
  }, [refreshDocuments]);

  const handleUploaded = () => {
    refreshDocuments();
  };

  const filteredDocs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((doc) => doc.filename.toLowerCase().includes(query));
  }, [documents, search]);

  const selectedDoc = filteredDocs.find((doc) => doc.id === selectedId) || null;

  const toggleSelected = (id) => {
    setSelectedId((current) => (current === id ? null : id));
  };

  const handleDelete = (doc) => {
    const confirmed = window.confirm(`Supprimer définitivement "${doc.filename}" ?`);
    if (!confirmed) return;
    deleteDocument(doc.id, apiBase)
      .then(() => {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        setSelectedId((current) => (current === doc.id ? null : current));
      })
      .catch(() => {
        window.alert("La suppression a échoué. Vérifiez que le backend est disponible.");
      });
  };

  return (
    <div className="documents-page">
      <section className="v2-card v2-card-padding documents-hero">
        <div>
          <span className="v2-pill">Gestion documentaire</span>
          <h2>Document Library</h2>
          <p>
            Browse documents uploaded and indexed for AI-assisted research,
            ready for analysis by the AI Assistant.
          </p>
        </div>

        <div className="documents-hero-actions">
          <button className="v2-primary-button" onClick={() => togglePanel("upload")}>
            {activePanel === "upload" ? <X size={16} strokeWidth={1.75} /> : <Plus size={16} strokeWidth={1.75} />}
            {activePanel === "upload" ? "Fermer" : "Importer un document"}
          </button>
          <button className="v2-secondary-button" onClick={() => togglePanel("translate")}>
            {activePanel === "translate" ? <X size={16} strokeWidth={1.75} /> : <Languages size={16} strokeWidth={1.75} />}
            {activePanel === "translate" ? "Fermer" : "Traduire un document"}
          </button>
        </div>
      </section>

      {activePanel === "upload" && (
        <section className="v2-card v2-card-padding documents-upload-panel">
          <span className="v2-pill">Import & indexation</span>
          <h3>Importer un nouveau document</h3>
          <UploadComponent apiBase={apiBase} onUploaded={handleUploaded} />
        </section>
      )}

      {activePanel === "translate" && (
        <section className="v2-card v2-card-padding documents-upload-panel">
          <span className="v2-pill">Traduction de document</span>
          <DocumentTranslateComponent apiBase={apiBase} onIndexed={handleUploaded} />
        </section>
      )}

      <section className="v2-card v2-card-padding documents-panel">
        <div className="documents-toolbar">
          <div className="documents-search">
            <Search size={16} strokeWidth={1.75} />
            <input
              type="search"
              placeholder="Rechercher par nom de fichier..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {loading && <div className="v2-loading-state">Chargement des documents...</div>}

        {!loading && error && (
          <div className="v2-empty-state">Impossible de récupérer les documents pour le moment.</div>
        )}

        {!loading && !error && documents.length === 0 && (
          <div className="v2-empty-state">
            Aucun document indexé. Cliquez sur "Importer un document" ci-dessus pour commencer.
          </div>
        )}

        {!loading && !error && documents.length > 0 && (
          <div className="v2-table-wrap documents-table">
            <div className="v2-table-row v2-table-head documents-row">
              <span>Document</span>
              <span>Date d'import</span>
              <span>Taille</span>
              <span>Texte extrait</span>
              <span>Chunks</span>
              <span>Statut</span>
              <span>Actions</span>
            </div>

            {filteredDocs.length === 0 && (
              <div className="v2-empty-state">Aucun document ne correspond à cette recherche.</div>
            )}

            {filteredDocs.map((doc) => (
              <div className="v2-table-row documents-row" key={doc.id}>
                <span className="documents-title-wrap">
                  <strong className="documents-title-cell" onClick={() => toggleSelected(doc.id)}>
                    {doc.filename}
                  </strong>
                  {doc.ticker && (
                    <span
                      className="v2-badge v2-badge-info documents-ticker-badge"
                      title={`Voir ${doc.ticker} dans le Marché`}
                      onClick={() => setActivePage("market", { state: { ticker: doc.ticker } })}
                    >
                      {doc.ticker}
                    </span>
                  )}
                </span>
                <span>{formatDateTime(doc.uploaded_at)}</span>
                <span>{formatBytes(doc.size)}</span>
                <span>{doc.text_length ? `${doc.text_length.toLocaleString("fr-FR")} car.` : "—"}</span>
                <span>{doc.chunks_created}</span>
                <span className="v2-badge v2-badge-success">
                  <CheckCircle2 size={13} strokeWidth={1.75} />
                  {formatStatus(doc.status)}
                </span>
                <span className="doc-actions">
                  <button type="button" title="Ouvrir" onClick={() => toggleSelected(doc.id)}>
                    <Eye size={15} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title="Analyse IA"
                    onClick={() => setActivePage("ai", { state: { documentSource: doc.filename } })}
                  >
                    <Bot size={15} strokeWidth={1.75} />
                  </button>
                  <button type="button" title="Supprimer" onClick={() => handleDelete(doc)}>
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {selectedDoc && (
          <div className="documents-detail">
            <div className="documents-detail-header">
              <h3>{selectedDoc.filename}</h3>
              <span className="v2-badge v2-badge-success">
                <CheckCircle2 size={13} strokeWidth={1.75} />
                {formatStatus(selectedDoc.status)}
              </span>
              {selectedDoc.ticker && (
                <span
                  className="v2-badge v2-badge-info documents-ticker-badge"
                  onClick={() => setActivePage("market", { state: { ticker: selectedDoc.ticker } })}
                >
                  {selectedDoc.ticker} — voir dans le Marché
                </span>
              )}
            </div>
            <div className="documents-detail-grid">
              <div>
                <span>Date d'import</span>
                <strong>{formatDateTime(selectedDoc.uploaded_at)}</strong>
              </div>
              <div>
                <span>Taille</span>
                <strong>{formatBytes(selectedDoc.size)}</strong>
              </div>
              <div>
                <span>Texte extrait</span>
                <strong>{selectedDoc.text_length ? `${selectedDoc.text_length.toLocaleString("fr-FR")} caractères` : "—"}</strong>
              </div>
              <div>
                <span>Chunks indexés</span>
                <strong>{selectedDoc.chunks_created}</strong>
              </div>
            </div>

            <div className="documents-detail-preview">
              <span>Aperçu du texte extrait par l'OCR</span>
              {selectedDoc.text_preview ? (
                <pre>{selectedDoc.text_preview}</pre>
              ) : (
                <div className="documents-detail-preview-empty">
                  Aucun texte lisible n'a été extrait de ce document.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default DocumentsPage;
