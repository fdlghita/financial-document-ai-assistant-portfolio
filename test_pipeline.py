import sys
import os
import pandas as pd
import requests

# Assurer que le chemin du backend est dans le sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

from app.extractor import PDFExtractor
from app.vector_store import VectorStore
from app.rag_chain import RAGChain


def _ollama_is_up(base_url: str = "http://localhost:11434") -> bool:
    try:
        r = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def main(pdf_path: str):
    """Script de test complet pour le pipeline RAG."""
    print(f"--- 1. Démarrage du traitement pour : {os.path.basename(pdf_path)} ---")

    if not os.path.exists(pdf_path):
        print(f"ERREUR : Le fichier '{pdf_path}' n'a pas été trouvé.")
        return

    # --- Étape 1: Extraction des données ---
    print("\n--- 2. Extraction du texte et des tableaux du PDF ---")
    try:
        extractor = PDFExtractor(pdf_path)
        
        # Extraire le texte
        full_text = extractor.extract_text()
        if "Error extracting text" in full_text:
            print(f"Erreur lors de l'extraction du texte : {full_text}")
            return
        print(f"   - Texte extrait avec succès ({len(full_text)} caractères).")

        # Extraire les tableaux
        tables = extractor.extract_tables()
        print(f"   - {len(tables)} tableau(x) extrait(s) avec succès.")
        
        if tables:
            print("   - Aperçu du premier tableau (5 premières lignes) :")
            print(tables[0].head().to_string())

    except Exception as e:
        print(f"ERREUR CRITIQUE lors de l'extraction : {e}")
        print("Veuillez vérifier que toutes les dépendances (y compris Ghostscript) sont correctement installées.")
        return

    # --- Étape 2: Création de la base vectorielle ---
    print("\n--- 3. Création de la base de données vectorielle (ChromaDB) ---")
    try:
        vector_store = VectorStore()
        n_chunks = vector_store.create_from_text(full_text, source=os.path.basename(pdf_path))
        print(f"   - Base vectorielle alimentée avec succès ({n_chunks} chunks).")
    except Exception as e:
        print(f"ERREUR CRITIQUE lors de la création de la base vectorielle : {e}")
        return

    # --- Étape 3: Chaîne de Questions-Réponses (RAG) ---
    print("\n--- 4. Test de la chaîne RAG avec une question ---")
    base_url = "http://localhost:11434"
    if not _ollama_is_up(base_url):
        print(
            "ERREUR : Ollama n'est pas accessible sur http://localhost:11434. "
            "Lancez Ollama puis téléchargez le modèle si besoin (ex: 'ollama pull llama3')."
        )
        return

    try:
        rag_chain = RAGChain(vector_store=vector_store, base_url=base_url, model="llama3")
        question = "Quel est le chiffre d'affaires (ou produit des activités ordinaires) de TGCC ?"
        print(f"   - Question : '{question}'")

        answer = rag_chain.ask(question)

        print("\n--- 5. Résultat ---")
        print("Réponse du LLM (basée sur le document) :")
        print(answer)

    except Exception as e:
        print(f"ERREUR CRITIQUE lors de l'interrogation du LLM : {e}")
        print("Vérifiez que le modèle 'llama3' est disponible dans Ollama.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        main(file_path)
    else:
        # Chemin par défaut si aucun n'est fourni
        default_pdf_path = r"C:\Users\H P\Downloads\TCGG_2024_CP_RFA_2024.pdf"
        print(f"Aucun chemin de fichier fourni. Utilisation du chemin par défaut : {default_pdf_path}")
        main(default_pdf_path)
