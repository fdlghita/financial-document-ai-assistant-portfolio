import os
import pdfplumber
import pandas as pd
import camelot
from typing import List, Dict, Any

def _add_ghostscript_to_path() -> None:
    env_path = os.getenv("GHOSTSCRIPT_BIN")
    candidates = [
        env_path,
        r"C:\Program Files\gs\gs10.07.0\bin",
        r"C:\Program Files\gs\gs10.06.0\bin",
    ]
    current_path = os.environ.get("PATH", "")
    for candidate in candidates:
        if candidate and os.path.isdir(candidate) and candidate not in current_path:
            os.environ["PATH"] = current_path + os.pathsep + candidate
            current_path = os.environ["PATH"]

_add_ghostscript_to_path()

class PDFExtractor:
    def __init__(self, file_path: str):
        self.file_path = file_path

    def extract_text(self) -> str:
        """
        Extrait tout le texte d'un fichier PDF financier.

        Hypothèse: le fichier fait moins de 50 Mo.
        """
        text = ""
        try:
            if not os.path.isfile(self.file_path):
                return f"Error extracting text: file not found: {self.file_path}"

            max_bytes = 50 * 1024 * 1024
            if os.path.getsize(self.file_path) > max_bytes:
                return "Error extracting text: PDF file is larger than 50MB"

            with pdfplumber.open(self.file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            return f"Error extracting text: {str(e)}"
        return text

    def extract_tables(self) -> List[pd.DataFrame]:
        """
        Détecte et extrait les tableaux financiers au format DataFrame pandas en utilisant Camelot.
        Note: Camelot nécessite Ghostscript installé sur le système.
        """
        try:
            tables = camelot.read_pdf(self.file_path, pages='all', flavor='stream')
            return [table.df for table in tables]
        except FileNotFoundError as e:
            if "ghostscript" in str(e).lower() or "gs" in str(e).lower():
                print("Ghostscript non trouve. Installez Ghostscript pour activer l'extraction de tableaux.")
            else:
                print(f"Error extracting tables: {str(e)}")
            return []
        except Exception as e:
            err = str(e).lower()
            if "ghostscript" in err or "cannot find ghostscript" in err:
                print("Ghostscript non trouve. Installez Ghostscript pour activer l'extraction de tableaux.")
            else:
                print(f"Error extracting tables: {str(e)}")
            return []
