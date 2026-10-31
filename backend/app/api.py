from __future__ import annotations

import asyncio
from datetime import datetime
import json
import os
import re
import unicodedata
import uuid
from pathlib import Path
from PIL import Image
import pytesseract
from pdf2image import convert_from_bytes
import io
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.extractor import PDFExtractor
from app.vector_store import VectorStore
from app.rag_chain import RAGChain
from app.document_translator import (
    SUPPORTED_LANGUAGES,
    LANGUAGE_NAMES,
    chunk_text_for_translation,
    translate_chunk,
    build_translated_pdf,
)
from core.llm import get_llm

router = APIRouter(prefix="/api", tags=["RAG"])

# Chemin pour stocker les PDFs uploadés
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Instance globale du VectorStore (une seule instance partagée)
vector_store = VectorStore()
rag_chain = RAGChain(
    vector_store=vector_store,
    model=os.getenv("LLM_MODEL", "llama3.2:3b"),
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
)

CHAT_STORE_PATH = UPLOAD_DIR / "chat_sessions.json"
DEFAULT_ASSISTANT_MESSAGE = {
    "role": "assistant",
    "content": (
        "Upload a PDF or ask a question about your indexed documents."
    ),
}
_chat_lock = asyncio.Lock()

DOCUMENTS_STORE_PATH = UPLOAD_DIR / "documents.json"
_documents_lock = asyncio.Lock()

RESULTS_DIR = Path(__file__).parent.parent / "temp_results"
RESULTS_DIR.mkdir(exist_ok=True)

def run_document_translation_background(
    pdf_path: str,
    source_lang: str,
    target_lang: str,
    result_id: str,
    original_filename: str,
) -> None:
    """Runs a full document translation as a background task: extract -> translate
    chunk by chunk (writing progress after each chunk) -> assemble a translated PDF.
    Cleans up the temporary uploaded PDF when done, regardless of outcome.
    """
    result_path = RESULTS_DIR / f"{result_id}.json"
    output_pdf_path = RESULTS_DIR / f"{result_id}.pdf"

    def write_status(payload: dict) -> None:
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)

    try:
        extractor = PDFExtractor(pdf_path)
        text = extractor.extract_text()
        if not text or "Error extracting text" in text:
            write_status({"status": "error", "message": "Impossible d'extraire le texte de ce PDF."})
            return

        chunks = chunk_text_for_translation(text)
        if not chunks:
            write_status({"status": "error", "message": "Document vide ou illisible."})
            return

        write_status({"status": "in_progress", "progress": {"done": 0, "total": len(chunks)}})

        llm = get_llm(
            model=os.getenv("LLM_MODEL", "llama3.2:3b"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )

        translated_paragraphs = []
        for i, chunk in enumerate(chunks):
            try:
                translated = translate_chunk(llm, chunk, source_lang, target_lang)
            except Exception as chunk_err:
                translated = f"[Erreur de traduction pour cette section : {chunk_err}]"
            translated_paragraphs.append(translated)
            write_status({"status": "in_progress", "progress": {"done": i + 1, "total": len(chunks)}})

        build_translated_pdf(
            translated_paragraphs,
            target_lang,
            str(output_pdf_path),
            title=f"{original_filename} (traduit)",
        )

        # Index the translation for the AI Assistant using the clean, logical text produced
        # by the LLM — NOT text re-extracted from the rendered PDF. For Arabic (and any RTL
        # target), build_translated_pdf visually reshapes/reorders the text so it *displays*
        # correctly (fpdf2 has no bidi support), which makes the PDF's own text layer garbled
        # and extremely token-inefficient if read back (measured ~10x more LLM tokens per
        # character than normal Arabic) — enough to overflow the local model's context window
        # and crash with a raw 500. Indexing straight from translated_paragraphs sidesteps
        # that lossy round-trip entirely.
        document_filename = None
        try:
            stem = Path(original_filename).stem
            document_filename = f"{stem} ({LANGUAGE_NAMES.get(target_lang, target_lang)}).pdf"
            indexed_text = "\n\n".join(translated_paragraphs)

            duplicate_ids = [
                doc_id for doc_id, doc in _documents_store.items()
                if doc.get("filename") == document_filename
            ]
            for doc_id in duplicate_ids:
                _documents_store.pop(doc_id, None)
            if duplicate_ids:
                try:
                    vector_store.delete_by_source(document_filename)
                except Exception:
                    pass

            dest_path = UPLOAD_DIR / document_filename
            with open(output_pdf_path, "rb") as src, open(dest_path, "wb") as dst:
                dst.write(src.read())

            n_chunks = vector_store.create_from_text(indexed_text, source=document_filename)
            record = _new_document_record(
                filename=document_filename,
                size=dest_path.stat().st_size,
                text_length=len(indexed_text),
                text_preview=indexed_text.strip()[:800],
                chunks_created=n_chunks,
                ticker=None,
            )
            _documents_store[record["id"]] = record
            _save_documents(_documents_store)
        except Exception:
            document_filename = None

        write_status({
            "status": "completed",
            "progress": {"done": len(chunks), "total": len(chunks)},
            "download_url": f"/api/translate_document/download/{result_id}",
            "document_filename": document_filename,
        })
    except Exception as e:
        write_status({"status": "error", "message": str(e)})
    finally:
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
        except Exception:
            pass


class ChatMessage(BaseModel):
    role: str
    content: str

    class Config:
        extra = "allow"


class ChatSession(BaseModel):
    id: str
    title: str
    messages: list[dict]
    created_at: str
    updated_at: str


class ChatCreate(BaseModel):
    title: str | None = None


class ChatUpdate(BaseModel):
    title: str | None = None
    messages: list[dict] | None = None


class DocumentRecord(BaseModel):
    id: str
    filename: str
    size: int
    text_length: int
    text_preview: str = ""
    ticker: str | None = None
    chunks_created: int
    uploaded_at: str
    status: str


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _load_chats() -> dict[str, dict]:
    if not CHAT_STORE_PATH.exists():
        return {}
    try:
        with open(CHAT_STORE_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            return {item.get("id", ""): item for item in payload if isinstance(item, dict)}
        if isinstance(payload, dict):
            return payload
    except Exception:
        return {}
    return {}


def _save_chats(store: dict[str, dict]) -> None:
    with open(CHAT_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(list(store.values()), f, ensure_ascii=True, indent=2)


def _new_chat(title: str | None = None) -> dict:
    chat_id = uuid.uuid4().hex
    now = _now_iso()
    return {
        "id": chat_id,
        "title": title or "Nouveau chat",
        "messages": [DEFAULT_ASSISTANT_MESSAGE.copy()],
        "created_at": now,
        "updated_at": now,
    }


_chat_store = _load_chats()


def _load_documents() -> dict[str, dict]:
    if not DOCUMENTS_STORE_PATH.exists():
        return {}
    try:
        with open(DOCUMENTS_STORE_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            return {item.get("id", ""): item for item in payload if isinstance(item, dict)}
        if isinstance(payload, dict):
            return payload
    except Exception:
        return {}
    return {}


def _save_documents(store: dict[str, dict]) -> None:
    with open(DOCUMENTS_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(list(store.values()), f, ensure_ascii=True, indent=2)


def _new_document_record(
    filename: str,
    size: int,
    text_length: int,
    text_preview: str,
    chunks_created: int,
    ticker: str | None = None,
) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "filename": filename,
        "size": size,
        "text_length": text_length,
        "text_preview": text_preview,
        "ticker": ticker,
        "chunks_created": chunks_created,
        "uploaded_at": _now_iso(),
        "status": "indexed",
    }


_documents_store = _load_documents()


class QuestionRequest(BaseModel):
    question: str
    history: list[dict[str, str]] = []
    source: str | None = None


class AnswerResponse(BaseModel):
    question: str
    answer: str
    sources_used: int
    source_refs: list[str] = []


MAX_RELEVANT_DISTANCE = 1.0

GENERAL_TIMEOUT_SECONDS = 180
RAG_TIMEOUT_SECONDS = 300


def _normalize_text(text: str) -> str:
    base = unicodedata.normalize("NFKD", (text or "").lower())
    base = "".join(ch for ch in base if not unicodedata.combining(ch))
    base = re.sub(r"[^a-z0-9\s]", " ", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base


def _detect_language(question: str) -> str:
    """Returns 'en' if the question appears to be in English, else 'fr'."""
    q = question.lower()
    english_markers = [
        "what", "how", "why", "when", "where", "which", "who",
        "give me", "show me", "tell me", "explain", "analyze", "analyse",
        "financial", "revenue", "profit", "loss", "balance",
        "equity", "assets", "liabilities", "income", "earnings",
        "is the", "are the", "what is", "what are", "can you",
        "the company", "the report", "indicators", "indicator",
        "show", "display", "overview", "summary", "listed",
    ]
    return "en" if any(m in q for m in english_markers) else "fr"


def _quick_general_answer(question: str, lang: str = "fr") -> str | None:
    q = _normalize_text(question)
    compact = q.replace(" ", "")

    if any(w in q.split() for w in ["merci", "thanks", "thankyou", "thank"]):
        if lang == "en":
            return "You're welcome. Ask another question about your documents."
        return "Avec plaisir. Posez une autre question sur vos documents."

    if "heure" in q or "lheure" in compact or "time" in q:
        now = datetime.now().strftime("%H:%M")
        if lang == "en":
            return f"It is currently {now} (server local time)."
        return f"Il est actuellement {now} (heure locale du serveur)."

    if "date" in q or "jour" in q or "today" in q:
        now_date = datetime.now().strftime("%d/%m/%Y")
        if lang == "en":
            return f"Today is {now_date}."
        return f"Nous sommes le {now_date}."

    return None


def _answer_looks_corrupted(answer: str) -> bool:
    text = (answer or "").strip()
    if not text:
        return True

    # Common mojibake markers from OCR/PDF extraction.
    bad_markers = ["Ã", "â€", "â€™", "OPÃ", "RÃ", "lâ"]
    if any(m in text for m in bad_markers):
        return True

    # Too many bracketed raw chunks often means fallback snippets are noisy.
    if text.count("[") >= 3 and "Question:" in text:
        return True

    return False


def _filter_relevant_hits(hits: list[dict]) -> list[dict]:
    relevant = []
    for h in hits:
        dist = h.get("distance")
        if isinstance(dist, (int, float)) and dist <= MAX_RELEVANT_DISTANCE:
            relevant.append(h)
    return relevant


def _sanitize_answer(answer: str) -> str:
    text = (answer or "").replace("\r", "").strip()
    text = re.sub(r"\.{3,}", ".", text)
    text = re.sub(r"\s+", " ", text)
    text = text.replace(" .", ".")
    text = text.strip()
    if text and text[-1] not in ".!?":
        text += "."
    return text


def _first_kdh(text: str, label: str, max_digits: int = 9) -> str | None:
    """
    Extract the first KDH-format number after `label` in `text`.
    KDH integers use spaces as thousands separators: "7 596 821", "316 399".
    When two consecutive same-magnitude numbers are fused (e.g. "316 399 316 399"),
    we cut at `max_digits` digits to get only the current-year value.
    """
    m = re.search(label + r"\s+(\d{1,3}(?:\s\d{3})+)", text, re.IGNORECASE)
    if not m:
        return None
    val = m.group(1).strip()
    digits_only = val.replace(" ", "")
    if len(digits_only) <= max_digits:
        return val
    # Fused pair: cut at first 6-7 digit boundary
    groups = val.split(" ")
    total = 0
    for i, g in enumerate(groups):
        total += len(g)
        if total >= 6:
            return " ".join(groups[: i + 1])
    return val


async def _stream_words(text: str):
    words = (text or "").split(" ")
    for idx, word in enumerate(words):
        suffix = " " if idx < len(words) - 1 else ""
        yield json.dumps({"content": word + suffix})
        await asyncio.sleep(0)


@router.post("/upload", summary="Upload a PDF and index it")
async def upload_pdf(file: UploadFile = File(...), ticker: str | None = Form(None)) -> dict:
    """Upload un PDF financier et l'indexe dans la base vectorielle."""
    try:
        ticker = ticker.strip().upper() or None if ticker else None
        # Vérifier que c'est un PDF
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

        # Sauvegarder temporairement
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Extraire le texte
        extractor = PDFExtractor(str(file_path))
        text = extractor.extract_text()

        if "Error extracting text" in text:
            raise HTTPException(status_code=400, detail=f"Erreur lors de l'extraction : {text}")

        # ChromaDB indexe par nom de fichier (metadonnee "source"), pas par id de
        # registre : si un document du meme nom existe deja, on retire d'abord son
        # entree de registre pour eviter que deux entrees partagent le meme contenu
        # vectoriel (supprimer l'une supprimerait alors aussi le contenu de l'autre).
        async with _documents_lock:
            duplicate_ids = [
                doc_id for doc_id, doc in _documents_store.items()
                if doc.get("filename") == file.filename
            ]
            for doc_id in duplicate_ids:
                _documents_store.pop(doc_id, None)
            if duplicate_ids:
                _save_documents(_documents_store)

        if duplicate_ids:
            try:
                # Nettoie aussi les chunks d'une version precedente dont le contenu
                # (et donc les identifiants, bases sur un hash du texte) aurait change.
                vector_store.delete_by_source(file.filename)
            except Exception:
                pass

        # Indexer (upsert : reecrit proprement le contenu vectoriel de ce nom de fichier)
        n_chunks = vector_store.create_from_text(text, source=file.filename)
        vector_store.set_last_file_path(str(file_path))

        text_preview = text.strip()[:800]

        # Enregistrer dans le registre des documents (persistant, JSON)
        async with _documents_lock:
            record = _new_document_record(
                filename=file.filename,
                size=len(content),
                text_length=len(text),
                text_preview=text_preview,
                chunks_created=n_chunks,
                ticker=ticker,
            )
            _documents_store[record["id"]] = record
            _save_documents(_documents_store)

        return {
            "filename": file.filename,
            "size": len(content),
            "text_length": len(text),
            "text_preview": text_preview,
            "ticker": ticker,
            "chunks_created": n_chunks,
            "status": "indexed",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")


@router.post("/translate_document", summary="Translate a full PDF document and generate a translated PDF")
async def translate_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    source_lang: str = Form(...),
    target_lang: str = Form(...),
) -> dict:
    """Traduit un document PDF complet et genere un nouveau PDF traduit.

    Tache longue (plusieurs minutes a plusieurs heures selon la taille du document
    sur un LLM local CPU) : demarree en arriere-plan, suivie via l'endpoint de
    polling existant GET /api/chat/results/{result_id}, puis telechargeable via
    GET /api/translate_document/download/{result_id} une fois terminee.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptes.")
    if source_lang not in SUPPORTED_LANGUAGES or target_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Langue non prise en charge.")
    if source_lang == target_lang:
        raise HTTPException(status_code=400, detail="La langue source et la langue cible doivent etre differentes.")

    result_id = f"doctranslate_{uuid.uuid4().hex}"
    temp_path = UPLOAD_DIR / f"temp_translate_{result_id}.pdf"
    content = await file.read()
    with open(temp_path, "wb") as f:
        f.write(content)

    with open(RESULTS_DIR / f"{result_id}.json", "w", encoding="utf-8") as f:
        json.dump({"status": "in_progress", "progress": {"done": 0, "total": 1}}, f)

    background_tasks.add_task(
        run_document_translation_background,
        str(temp_path),
        source_lang,
        target_lang,
        result_id,
        file.filename,
    )

    return {"result_id": result_id}


@router.get("/translate_document/download/{result_id}", summary="Download the translated PDF")
async def download_translated_document(result_id: str):
    pdf_path = RESULTS_DIR / f"{result_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Traduction introuvable ou pas encore terminee.")
    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename=f"document_traduit_{result_id[:8]}.pdf",
    )


@router.post("/ask", response_model=AnswerResponse, summary="Ask a question about indexed documents")
async def ask_question(req: QuestionRequest) -> AnswerResponse:
    """Pose une question conversationnelle (avec ou sans contexte PDF)."""
    try:
        question = req.question.strip()
        if not question:
            raise HTTPException(status_code=400, detail="La question ne peut pas être vide.")

        # Eviter les prompts trop longs qui ralentissent fortement le modele en CPU-only.
        if len(question) > 1800:
            question = question[:1800]

        # Reponses rapides pour les questions courantes (y compris fautes d'orthographe).
        quick_answer = _quick_general_answer(question)
        if quick_answer is not None:
            return AnswerResponse(
                question=question,
                answer=quick_answer,
                sources_used=0,
                source_refs=[],
            )

        # Nettoyer l'historique et ne garder que les derniers tours.
        raw_history = req.history or []
        history: list[dict[str, str]] = []
        for turn in raw_history[-10:]:
            role = str(turn.get("role", "")).strip().lower()
            content = str(turn.get("content", "")).strip()
            if role in {"user", "assistant"} and content:
                history.append({"role": role, "content": content[:1200]})

        _k = 2 if os.getenv("LLAMA_CPP_URL") else 3
        try:
            hits = await asyncio.to_thread(vector_store.similarity_search, question, _k, req.source)
        except Exception:
            hits = []

        hits = _filter_relevant_hits(hits)

        try:
            if hits:
                answer = await asyncio.wait_for(
                    asyncio.to_thread(rag_chain.answer, question, history=history, hits=hits, k=_k),
                    timeout=RAG_TIMEOUT_SECONDS,
                )
            else:
                answer = await asyncio.wait_for(
                    asyncio.to_thread(rag_chain.answer_general, question, history=history),
                    timeout=GENERAL_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError:
            answer = "Le modele IA a pris trop de temps. Reessayez dans quelques secondes."
        except Exception as llm_err:
            err_str = str(llm_err)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                answer = "Limite de requetes atteinte (quota Gemini). Reessayez dans 30 secondes."
            elif "llama.cpp" in err_str.lower() or "serveur llama" in err_str.lower() or "start_llama" in err_str:
                answer = "Le serveur llama.cpp n'est pas demarre. Lancez start_llama.bat puis reessayez."
            else:
                answer = f"Erreur du modele IA : {err_str[:200]}"

        return AnswerResponse(
            question=question,
            answer=_sanitize_answer(answer),
            sources_used=len(hits),
            source_refs=[str(i + 1) for i in range(len(hits))],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement : {str(e)}")


@router.post("/ask_stream", summary="Ask a question with streaming response")
async def ask_question_stream(req: QuestionRequest, background_tasks: BackgroundTasks) -> StreamingResponse:
    """Streaming response for chat UX (word-by-word)."""
    try:
        question = req.question.strip()
        if not question:
            raise HTTPException(status_code=400, detail="La question ne peut pas etre vide.")

        if len(question) > 1800:
            question = question[:1800]

        lang = _detect_language(question)

        quick_answer = _quick_general_answer(question, lang=lang)
        if quick_answer is not None:
            async def quick_stream():
                async for chunk in _stream_words(quick_answer):
                    yield f"data: {chunk}\n\n"
            return StreamingResponse(quick_stream(), media_type="text/event-stream")

        raw_history = req.history or []
        history: list[dict[str, str]] = []
        for turn in raw_history[-10:]:
            role = str(turn.get("role", "")).strip().lower()
            content = str(turn.get("content", "")).strip()
            if role in {"user", "assistant"} and content:
                history.append({"role": role, "content": content[:1200]})

        # Use 2 chunks for local LLM (shorter prompt = faster CPU inference)
        # Use 3 chunks for cloud LLM (higher quality context)
        _k = 2 if os.getenv("LLAMA_CPP_URL") else 3
        try:
            hits = await asyncio.to_thread(vector_store.similarity_search, question, _k, req.source)
        except Exception:
            hits = []

        hits = _filter_relevant_hits(hits)

        try:
            if hits:
                answer = await asyncio.wait_for(
                    asyncio.to_thread(rag_chain.answer, question, history=history, hits=hits, k=_k, lang=lang),
                    timeout=RAG_TIMEOUT_SECONDS,
                )
            else:
                answer = await asyncio.wait_for(
                    asyncio.to_thread(rag_chain.answer_general, question, history=history, lang=lang),
                    timeout=GENERAL_TIMEOUT_SECONDS,
                )
        except asyncio.TimeoutError:
            if lang == "en":
                answer = "The AI model took too long. Please try again in a few seconds."
            else:
                answer = "Le modele IA a pris trop de temps. Reessayez dans quelques secondes."
        except Exception as llm_err:
            err_str = str(llm_err)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                answer = "Limite de requetes atteinte (quota Gemini). Reessayez dans 30 secondes."
            elif "quota" in err_str.lower():
                answer = "Quota API depasse. Verifiez votre cle Gemini sur ai.google.dev."
            elif "llama.cpp" in err_str.lower() or "serveur llama" in err_str.lower() or "start_llama" in err_str:
                answer = "Le serveur llama.cpp n'est pas demarre. Lancez start_llama.bat puis reessayez."
            else:
                answer = f"Erreur du modele IA : {err_str[:200]}"

        answer = _sanitize_answer(answer)

        async def stream():
            async for chunk in _stream_words(answer):
                yield f"data: {chunk}\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement : {str(e)}")


@router.get("/chats", response_model=list[ChatSession], summary="List chat sessions")
async def list_chats() -> list[dict]:
    async with _chat_lock:
        chats = list(_chat_store.values())
    return sorted(chats, key=lambda c: c.get("updated_at", ""), reverse=True)


@router.post("/chats", response_model=ChatSession, summary="Create chat session")
async def create_chat(payload: ChatCreate) -> dict:
    async with _chat_lock:
        chat = _new_chat(payload.title)
        _chat_store[chat["id"]] = chat
        _save_chats(_chat_store)
    return chat


@router.get("/chats/{chat_id}", response_model=ChatSession, summary="Get chat session")
async def get_chat(chat_id: str) -> dict:
    async with _chat_lock:
        chat = _chat_store.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat introuvable")
    return chat


@router.put("/chats/{chat_id}", response_model=ChatSession, summary="Update chat session")
async def update_chat(chat_id: str, payload: ChatUpdate) -> dict:
    async with _chat_lock:
        chat = _chat_store.get(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat introuvable")
        if payload.title is not None:
            chat["title"] = payload.title
        if payload.messages is not None:
            chat["messages"] = payload.messages
        chat["updated_at"] = _now_iso()
        _chat_store[chat_id] = chat
        _save_chats(_chat_store)
        return chat


@router.delete("/chats/{chat_id}", summary="Delete chat session")
async def delete_chat(chat_id: str) -> dict:
    async with _chat_lock:
        chat = _chat_store.pop(chat_id, None)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat introuvable")
        _save_chats(_chat_store)
    return {"status": "deleted", "id": chat_id}


@router.get("/documents", response_model=list[DocumentRecord], summary="List uploaded/indexed documents")
async def list_documents() -> list[dict]:
    async with _documents_lock:
        docs = list(_documents_store.values())
    return sorted(docs, key=lambda d: d.get("uploaded_at", ""), reverse=True)


@router.delete("/documents/{document_id}", summary="Delete a document record (does not un-index it from RAG search)")
async def delete_document(document_id: str) -> dict:
    async with _documents_lock:
        doc = _documents_store.pop(document_id, None)
        if not doc:
            raise HTTPException(status_code=404, detail="Document introuvable")
        _save_documents(_documents_store)

        file_path = UPLOAD_DIR / doc["filename"]
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            pass  # suppression du fichier best-effort ; l'entrée du registre est déjà retirée

        try:
            vector_store.delete_by_source(doc["filename"])
        except Exception:
            pass  # suppression vectorielle best-effort ; l'entrée du registre est déjà retirée

    return {"status": "deleted", "id": document_id}


@router.get("/health", summary="Health check")
async def health() -> dict:
    """Vérifier que l'API et le LLM sont opérationnels."""
    return {
        "status": "healthy",
        "llm": os.getenv("LLM_MODEL", "llama3.2:3b"),
        "vector_db": "chromadb",
    }


@router.get("/chat/results/{result_id}")
async def get_chat_result(result_id: str):
    """
    Poll this endpoint to get the result of a background task.
    """
    result_path = RESULTS_DIR / f"{result_id}.json"
    if not result_path.exists():
        return {"status": "pending"}
    
    try:
        with open(result_path, 'r', encoding='utf-8') as f:
            result = json.load(f)
        # Optionally, delete the file after reading to clean up
        # os.remove(result_path)
        return result
    except Exception as e:
        return {"status": "error", "message": f"Could not read result file: {e}"}
