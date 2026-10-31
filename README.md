# Financial Document AI Assistant

**A local-first, full-stack document intelligence application built with Python, FastAPI, React and retrieval-augmented generation (RAG).**

Upload PDF documents, index their contents, ask questions using a local language model, and organize document-based conversations.

**Status:** Portfolio refactor / local development prototype. The project has not been independently verified as production-ready.

## What it does

- **PDF ingestion:** extract text and tables, then store document metadata.
- **Semantic search:** split document content into chunks and index embeddings with ChromaDB.
- **RAG assistant:** retrieve relevant passages and answer questions with a configurable language model.
- **Document-scoped queries:** focus questions on a selected indexed document.
- **Chat history:** store conversations locally.
- **OCR and translation:** optional document/image extraction and translation utilities.
- **Local-first inference:** run Qwen2.5-3B-Instruct via llama.cpp, or configure Ollama or a cloud model provider.

## Architecture

```text
React frontend
  |-- Dashboard
  |-- AI Assistant
  |-- Document Library
         |
      FastAPI
         |
  PDF ingestion / extraction
         |
   Chunking + embeddings
         |
      ChromaDB
         |
    RAG retrieval
         |
  llama.cpp / Ollama / Gemini
```

The application focuses on general-purpose document intelligence; institution-specific Drupal and Moroccan accounting components have been removed from the current source tree. Earlier versions may still exist in Git history.

## Stack

| Component | Technology |
| --- | --- |
| UI | React, React Router, Tailwind CSS, Lucide |
| API | FastAPI, Pydantic, Uvicorn |
| Retrieval | LangChain, sentence-transformers, ChromaDB |
| Inference | Qwen2.5-3B-Instruct GGUF via llama.cpp; optional Ollama / Gemini |
| Extraction | pdfplumber, Camelot, pdf2image, pytesseract |
| Local persistence | Filesystem, JSON records and ChromaDB |

## Getting started

**Prerequisites:** Python 3.11, Node.js 18+, npm and llama.cpp. Optional OCR workflows require Poppler, Tesseract and possibly Ghostscript.

### Install

```powershell
git clone https://github.com/fdlghita/financial-document-ai-assistant-portfolio.git
cd financial-document-ai-assistant
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install huggingface_hub
python download_model.py
cd frontend
npm install
cd ..
Copy-Item backend/.env.example backend/.env
```

Model weights are downloaded separately and are not committed.

### Run

On Windows, run `start_all.bat`. Alternatively, use three terminals:

```powershell
# Terminal 1, from repository root
llama-server -m models\Qwen2.5-3B-Instruct-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 4096 -n 1024 --threads 8
```

```powershell
# Terminal 2, from repository root
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 3, from repository root
cd frontend
npm start
```

| Service | URL |
| --- | --- |
| React UI | http://localhost:3000 |
| FastAPI | http://127.0.0.1:8000 |
| Local LLM | http://127.0.0.1:8080 |

### Suggested demo

1. Open the **Document Library** and upload a non-confidential PDF.
2. Check that extraction and indexing finish successfully.
3. Open the **AI Assistant** and select the document.
4. Ask: *"Summarize the document in five bullet points."*
5. Compare the answer with the original document and inspect the retrieved context.

Do not treat model answers as verified facts without checking source documents.

## Repository layout

```text
backend/
  app/
    api.py                  # API endpoints and document workflows
    extractor.py            # PDF text and table extraction
    vector_store.py         # ChromaDB operations
    rag_chain.py            # Retrieval and LLM prompts
    document_translator.py  # Optional translation workflow
  core/llm.py               # Model provider adapters
frontend/
  src/
    pages/                  # Dashboard, Assistant, Documents
    components/             # UI and upload/chat components
    services/api.js         # API client
models/                     # Downloaded model files (ignored by Git)
download_model.py
start_all.bat
requirements.txt
```

## Verification

```powershell
# Frontend
cd frontend
$env:CI="true"
npm test -- --watchAll=false
npm run build
```

```powershell
# Backend: from repository root with the virtual environment active
python -m compileall -q backend
```

**These commands are recommended verification steps, not claims of tests already passed.** Full runtime tests require installed dependencies and the local model.

## Security and publication

- The repository is **public**. The current source tree has been cleaned, but its earlier Git history has not been rewritten.
- Keep real PDFs, chat logs, API credentials, vector stores and downloaded models out of Git.
- The local startup scripts bind API/model services to loopback; do not expose them publicly without authentication, authorization, rate limits and deployment review.
- Optional cloud providers may receive document content. Use them only with appropriate permission.
- Review all repository history, artwork, licenses and rights before any public release.
- Never commit `REACT_APP_*` secrets: React frontend environment variables are visible in built assets.

See [PRIVACY_REVIEW.md](PRIVACY_REVIEW.md).

## Engineering roadmap

- [ ] Execute and document frontend build, tests and backend smoke tests
- [ ] Replace domain-specific RAG prompt and remaining French UI strings
- [x] Remove original Drupal and Moroccan accounting integrations from the current source tree
- [ ] Add reproducible sample PDFs containing synthetic data
- [ ] Add retrieval evaluation and citation-quality checks
- [ ] Audit dependencies and add CI
- [ ] Verify publication permissions and repository history before changing visibility

## Maintainer

[Ghita Fadili](https://github.com/fdlghita)

*Engineering portfolio project showcasing full-stack development, document processing, local LLM inference and retrieval-augmented generation.*
