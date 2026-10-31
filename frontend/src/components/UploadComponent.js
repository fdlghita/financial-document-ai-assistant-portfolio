import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

const MAX_FILE_MB = 50;

function UploadComponent({ apiBase, onUploaded }) {
  const [file, setFile] = useState(null);
  const [ticker, setTicker] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const progressTimerRef = useRef(null);

  const validateFile = (selectedFile) => {
    if (!selectedFile) {
      return "No file selected";
    }
    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return "Only PDF files are allowed";
    }
    const sizeMb = selectedFile.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      return `File is too large (max ${MAX_FILE_MB} MB)`;
    }
    return "";
  };

  const applySelectedFile = (selectedFile) => {
    clearProgressTimer();
    const validationError = validateFile(selectedFile);
    setError(validationError);
    setFile(validationError ? null : selectedFile);
    setResult(null);
    setProgress(0);
    setStatus("idle");
  };

  const handleFileChange = (event) => {
    applySelectedFile(event.target.files?.[0] || null);
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    applySelectedFile(event.dataTransfer.files?.[0] || null);
  };

  const clearProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const handleUpload = () => {
    if (!file) {
      setError("Please choose a PDF file");
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setStatus("uploading");
    setProgress(1);

    const formData = new FormData();
    formData.append("file", file);
    if (ticker.trim()) {
      formData.append("ticker", ticker.trim().toUpperCase());
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/upload`);
    xhr.timeout = 900000;

    xhr.onloadstart = () => {
      setProgress(5);
      clearProgressTimer();
      progressTimerRef.current = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + Math.max(1, Math.round((90 - prev) / 8)) : prev));
      }, 450);
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.min(95, Math.round((event.loaded / event.total) * 100));
        setProgress(percent);
      }
    };

    xhr.upload.onload = () => {
      setStatus("processing");
      setProgress(100);
    };

    xhr.onloadend = () => {
      clearProgressTimer();
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        setResult(data);
        setStatus("done");
        setProgress(100);
        if (onUploaded) {
          onUploaded(data);
        }
      } else {
        let detail = "Upload failed";
        try {
          const parsed = JSON.parse(xhr.responseText);
          detail = parsed.detail || detail;
        } catch {
          // ignore JSON parsing errors
        }
        setError(detail);
        setStatus("error");
      }
    };

    xhr.onerror = () => {
      setError("Network error while uploading");
      setStatus("error");
    };

    xhr.ontimeout = () => {
      setError("Upload timed out. Check backend status.");
      setStatus("error");
    };

    xhr.send(formData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="upload-title">Importer un PDF</h2>
        <p className="upload-subtitle">Indexez un rapport pour l'analyse RAG.</p>
      </div>

      <div className="upload-field">
        <label className="upload-label">Société / ticker (optionnel)</label>
        <input
          type="text"
          className="upload-ticker-input"
          placeholder="ATW, IAM, BCP..."
          value={ticker}
          onChange={(event) => setTicker(event.target.value)}
        />
      </div>

      <div className="upload-field">
        <label className="upload-label">Sélectionner un PDF</label>
        <label
          className={`upload-drop ${dragActive ? "upload-drop-active" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy-soft text-brand-navy">
            <UploadCloud size={20} strokeWidth={1.75} />
          </span>
          <span className="upload-drop-title">Glissez-déposez un PDF ou cliquez pour parcourir</span>
          <span className="upload-file">{file ? file.name : "Aucun fichier"}</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        {error && <div className="upload-error">{error}</div>}
      </div>

      <div className="upload-actions">
        <button
          onClick={handleUpload}
          disabled={status === "uploading" || status === "processing" || !file}
          className="upload-button"
        >
          {status === "uploading" && "Envoi en cours..."}
          {status === "processing" && "Traitement du document..."}
          {(status === "idle" || status === "done" || status === "error") && "Importer et indexer"}
        </button>
        <div className="upload-progress">
          <div
            className="upload-progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>
        {status === "processing" && (
          <div className="upload-note">Fichier chargé, extraction en cours...</div>
        )}
      </div>

      <div className="upload-status">
        <div className="upload-status-head">
          <span>Statut</span>
          <span className="upload-status-pill">
            {status === "idle" && "Prêt"}
            {status === "uploading" && "Envoi en cours"}
            {status === "processing" && "Traitement en cours"}
            {status === "done" && "Indexé"}
            {status === "error" && "Erreur"}
          </span>
        </div>
        {result && (
          <div className="upload-result">
            <div>Fichier : {result.filename}</div>
            {result.ticker && <div>Ticker : {result.ticker}</div>}
            <div>Taille : {Math.round(result.size / 1024)} KB</div>
            <div>Chunks : {result.chunks_created}</div>
            <div>Texte extrait : {result.text_length?.toLocaleString("fr-FR") ?? 0} caractères</div>
          </div>
        )}
        {!result && (status === "uploading" || status === "processing") && (
          <div className="upload-endpoint">
            Endpoint : {apiBase}/api/upload
          </div>
        )}
      </div>

      {result && (
        <div className="upload-preview">
          <div className="upload-preview-head">
            <span>Aperçu du texte extrait par l'OCR</span>
          </div>
          {result.text_preview ? (
            <pre className="upload-preview-text">{result.text_preview}</pre>
          ) : (
            <div className="upload-preview-empty">
              Aucun texte lisible n'a été extrait de ce document — l'OCR n'a probablement pas
              fonctionné (scan de mauvaise qualité ou PDF non textuel).
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UploadComponent;
