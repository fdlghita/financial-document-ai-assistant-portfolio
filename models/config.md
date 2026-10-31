# Modèles LLM locaux

Ce dossier contient les fichiers GGUF pour llama.cpp.

## Modèle actuel
- **Qwen2.5-3B-Instruct-Q4_K_M.gguf** (~1.9 GB)
  - Multilingue : French ✅, Arabic ✅
  - Quantization : Q4_K_M (bon équilibre qualité/vitesse)
  - Vitesse CPU (i7-6820HQ) : ~20-35 secondes par réponse

## Démarrer le serveur llama.cpp
```bat
llama-server -m "models\Qwen2.5-3B-Instruct-Q4_K_M.gguf" --port 8080 -c 4096 -n 1024 --threads 8
```

## Alternative: modèle 7B (meilleure qualité, plus lent ~60-80s)
```py
# Changer FILENAME dans download_model.py:
REPO_ID = "bartowski/Qwen2.5-7B-Instruct-GGUF"
FILENAME = "Qwen2.5-7B-Instruct-Q4_K_M.gguf"
```
