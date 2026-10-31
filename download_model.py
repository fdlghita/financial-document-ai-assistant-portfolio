"""Download Qwen2.5-3B-Instruct-Q4_K_M.gguf into models/ folder."""
import os
from huggingface_hub import hf_hub_download

REPO_ID = "bartowski/Qwen2.5-3B-Instruct-GGUF"
FILENAME = "Qwen2.5-3B-Instruct-Q4_K_M.gguf"
LOCAL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

print(f"Downloading {FILENAME} from {REPO_ID}")
print(f"Destination: {LOCAL_DIR}")
print("This is ~1.9 GB — please wait...\n")

path = hf_hub_download(
    repo_id=REPO_ID,
    filename=FILENAME,
    local_dir=LOCAL_DIR,
)

print(f"\nDone! Model saved to:\n  {path}")
print("\nTo start the llama.cpp server, run:")
print(f'  llama-server -m "{path}" --port 8080 -c 4096 -n 1024 --threads 8')
