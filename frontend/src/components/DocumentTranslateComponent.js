import { useEffect, useRef, useState } from "react";
import { FileUp, Download } from "lucide-react";
import {
  startDocumentTranslation,
  getTranslationResult,
  getTranslationDownloadUrl,
} from "../services/api";

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "ar", label: "Arabe" },
];

function DocumentTranslateComponent({ apiBase, onIndexed }) {
  const [file, setFile] = useState(null);
  const [sourceLang, setSourceLang] = useState("fr");
  const [targetLang, setTargetLang] = useState("en");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [resultId, setResultId] = useState(null);
  const [documentFilename, setDocumentFilename] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setError("");
    setStatus("idle");
    setProgress(null);
    setResultId(null);
    setDocumentFilename(null);
  };

  const startPolling = (id) => {
    // A translation job can run for a long time in the background; a single missed
    // poll (a brief network hiccup, or the backend momentarily busy translating a
    // chunk) does not mean the job itself failed. Only give up after several
    // consecutive failures, so the progress UI doesn't die on one bad request while
    // the translation keeps running successfully server-side.
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    pollRef.current = setInterval(() => {
      getTranslationResult(id, apiBase)
        .then((data) => {
          consecutiveFailures = 0;
          if (data.status === "in_progress") {
            setProgress(data.progress || null);
          } else if (data.status === "completed") {
            clearInterval(pollRef.current);
            setStatus("done");
            setProgress(data.progress || null);
            setDocumentFilename(data.document_filename || null);
            if (data.document_filename && onIndexed) onIndexed();
          } else if (data.status === "error") {
            clearInterval(pollRef.current);
            setStatus("error");
            setError(data.message || "La traduction a échoué.");
          }
        })
        .catch(() => {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            clearInterval(pollRef.current);
            setStatus("error");
            setError(
              "Impossible de récupérer l'avancement de la traduction. Le backend est peut-être " +
                "indisponible — la traduction continue peut-être en arrière-plan ; réessayez plus tard " +
                "en revenant sur cette page."
            );
          }
        });
    }, 3000);
  };

  const handleTranslate = () => {
    if (!file) {
      setError("Veuillez choisir un PDF.");
      return;
    }
    if (sourceLang === targetLang) {
      setError("La langue source et la langue cible doivent être différentes.");
      return;
    }
    setError("");
    setStatus("uploading");
    setProgress(null);

    startDocumentTranslation(file, sourceLang, targetLang, apiBase)
      .then((data) => {
        setResultId(data.result_id);
        setStatus("in_progress");
        startPolling(data.result_id);
      })
      .catch((err) => {
        setStatus("error");
        setError(err.message || "Échec du démarrage de la traduction.");
      });
  };

  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="upload-title">Traduire un document</h2>
        <p className="upload-subtitle">
          Importez un rapport ou une fiche financière en PDF pour recevoir un nouveau PDF
          entièrement traduit. Le texte est traduit section par section par le modèle IA local —
          cela peut prendre de quelques minutes à plus d'une heure selon la taille du document.
        </p>
      </div>

      <div className="upload-field">
        <label className="upload-label">Sélectionner un PDF</label>
        <label className="upload-drop">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy-soft text-brand-navy">
            <FileUp size={20} strokeWidth={1.75} />
          </span>
          <span className="upload-drop-title">Cliquez pour choisir un PDF</span>
          <span className="upload-file">{file ? file.name : "Aucun fichier"}</span>
          <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      <div className="document-translate-langs">
        <div>
          <label className="upload-label">Langue source</label>
          <select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="upload-label">Langue cible</label>
          <select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="upload-error">
          {error}
          {status === "error" && resultId && (
            <button
              type="button"
              className="document-translate-retry"
              onClick={() => {
                setError("");
                setStatus("in_progress");
                startPolling(resultId);
              }}
            >
              Reprendre le suivi
            </button>
          )}
        </div>
      )}

      <div className="upload-actions">
        <button
          onClick={handleTranslate}
          disabled={status === "uploading" || status === "in_progress" || !file}
          className="upload-button"
        >
          {status === "uploading" && "Démarrage..."}
          {status === "in_progress" && "Traduction en cours..."}
          {(status === "idle" || status === "done" || status === "error") && "Traduire le document"}
        </button>
      </div>

      {status === "in_progress" && (
        <div className="document-translate-progress">
          <div className="upload-progress">
            <div className="upload-progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <div className="upload-note">
            {progress ? `${progress.done} / ${progress.total} sections traduites` : "Préparation..."}
          </div>
        </div>
      )}

      {status === "done" && resultId && (
        <div className="document-translate-done">
          <span className="v2-badge v2-badge-success">Traduction terminée</span>
          <a
            className="v2-primary-button"
            href={getTranslationDownloadUrl(resultId, apiBase)}
            download
          >
            <Download size={16} strokeWidth={1.75} />
            Télécharger le PDF traduit
          </a>
          {documentFilename && (
            <p className="document-translate-indexed-note">
              Egalement disponible dans vos documents et l'Assistant IA sous le nom
              « {documentFilename} ».
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentTranslateComponent;
