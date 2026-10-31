from __future__ import annotations

import hashlib
import os
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap must be >= 0")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be < chunk_size")

    text = (text or "").strip()
    if not text:
        return []

    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        chunks.append(text[start:end])
        if end == n:
            break
        start = max(0, end - chunk_overlap)
    return chunks


class VectorStore:
    def __init__(
        self,
        persist_dir: Optional[str] = None,
        collection_name: str = "financial_reports",
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
    ):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        default_dir = os.path.join(base_dir, "uploads", "chroma_db")
        self.persist_dir = os.path.abspath(persist_dir or default_dir)
        os.makedirs(self.persist_dir, exist_ok=True)
        self._last_file_path: Optional[str] = None

        self._client = chromadb.PersistentClient(
            path=self.persist_dir,
            settings=Settings(anonymized_telemetry=False),
        )

        self._embedding_fn = SentenceTransformerEmbeddingFunction(model_name=embedding_model)

        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            embedding_function=self._embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    def set_last_file_path(self, path: str) -> None:
        self._last_file_path = path

    def get_indexed_file_path(self) -> Optional[str]:
        return self._last_file_path

    def create_from_text(
        self,
        text: str,
        *,
        source: str = "pdf",
        chunk_size: int = 1400,
        chunk_overlap: int = 200,
    ) -> int:
        chunks = _chunk_text(text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        if not chunks:
            return 0

        ids: List[str] = []
        metadatas: List[Dict[str, Any]] = []
        for i, chunk in enumerate(chunks):
            chunk_id = hashlib.sha1(chunk.encode("utf-8")).hexdigest()
            ids.append(chunk_id)
            metadatas.append({"source": source, "chunk_index": i})

        self._collection.upsert(documents=chunks, ids=ids, metadatas=metadatas)
        return len(chunks)

    def count(self) -> int:
        return self._collection.count()

    def delete_by_source(self, source: str) -> None:
        self._collection.delete(where={"source": source})

    def get_all_chunks(self, source: Optional[str] = None) -> List[Dict[str, Any]]:
        result = self._collection.get(
            include=["documents", "metadatas"],
            where={"source": source} if source else None,
        )
        docs = result.get("documents") or []
        metas = result.get("metadatas") or []
        return [{"text": doc, "metadata": meta, "distance": 0.0} for doc, meta in zip(docs, metas)]

    def similarity_search(self, query: str, k: int = 4, source: Optional[str] = None) -> List[Dict[str, Any]]:
        result = self._collection.query(
            query_texts=[query],
            n_results=k,
            include=["documents", "metadatas", "distances"],
            where={"source": source} if source else None,
        )

        docs = (result.get("documents") or [[]])[0]
        metas = (result.get("metadatas") or [[]])[0]
        dists = (result.get("distances") or [[]])[0]

        hits: List[Dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, dists):
            hits.append({"text": doc, "metadata": meta, "distance": dist})
        return hits
