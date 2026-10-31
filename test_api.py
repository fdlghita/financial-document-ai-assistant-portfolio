#!/usr/bin/env python3
"""
Script pour tester l'API RAG Bourse de Casablanca.
Usage: python test_api.py <pdf_path>
"""

import sys
import requests
import json
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"


def test_health():
    """Test endpoint health."""
    print("\n--- Health Check ---")
    try:
        r = requests.get(f"{BASE_URL}/api/health", timeout=5)
        print(f"✅ Statut: {r.json()}")
        return True
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False


def upload_pdf(pdf_path: str) -> bool:
    """Upload un PDF."""
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        print(f"❌ Fichier non trouvé: {pdf_path}")
        return False

    print(f"\n--- Upload PDF: {pdf_path.name} ---")
    try:
        with open(pdf_path, "rb") as f:
            files = {"file": f}
            r = requests.post(f"{BASE_URL}/api/upload", files=files, timeout=60)

        if r.status_code == 200:
            result = r.json()
            print(f"✅ Upload succès:")
            print(f"   - Taille: {result['size']} bytes")
            print(f"   - Texte: {result['text_length']} caractères")
            print(f"   - Chunks: {result['chunks_created']}")
            return True
        else:
            print(f"❌ Erreur: {r.text}")
            return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False


def ask_question(question: str):
    """Pose une question."""
    print(f"\n--- Question: {question} ---")
    try:
        payload = {"question": question}
        r = requests.post(
            f"{BASE_URL}/api/ask",
            json=payload,
            timeout=600,  # 10 min timeout pour CPU mode
        )

        if r.status_code == 200:
            result = r.json()
            print(f"\n✅ Réponse:")
            print(result["answer"])
            print(f"\n📊 Sources: {result['sources_used']} chunk(s) utilisé(s)")
            return True
        else:
            print(f"❌ Erreur: {r.text}")
            return False
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_api.py <pdf_path> [question]")
        print("Example: python test_api.py 'C:\\path\\to\\rapport.pdf'")
        sys.exit(1)

    pdf_path = sys.argv[1]
    question = sys.argv[2] if len(sys.argv) > 2 else "Quel est le chiffre d'affaires ?"

    print("=" * 60)
    print("RAG API Tester - Bourse de Casablanca")
    print("=" * 60)

    # Test health
    if not test_health():
        print("\n⚠️ L'API n'est pas accessible sur http://127.0.0.1:8000")
        print("Lancez le serveur: .venv\\Scripts\\python -m uvicorn backend.main:app --port 8000")
        sys.exit(1)

    # Upload PDF
    if not upload_pdf(pdf_path):
        sys.exit(1)

    # Ask question
    ask_question(question)

    print("\n" + "=" * 60)
    print("✅ Test terminé!")
    print("=" * 60)


if __name__ == "__main__":
    main()
