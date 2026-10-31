import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router

app = FastAPI(
    title="Financial Document AI Assistant API",
    description="API pour l'extraction et l'interrogation de documents financiers via RAG",
    version="1.0.0",
)

def _split_origins(value: str | None) -> list[str]:
    if not value:
        return []
    return [origin.strip() for origin in value.split(",") if origin.strip()]


# CORS
default_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
    "http://localhost:3006",
    "http://localhost:3007",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
    "http://127.0.0.1:3005",
    "http://127.0.0.1:3006",
    "http://127.0.0.1:3007",
]
env_origins = _split_origins(os.getenv("CORS_ALLOW_ORIGINS"))
allowed_origins = sorted({*default_origins, *env_origins}) if env_origins else default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclure les routes
app.include_router(api_router)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Financial Document AI Assistant Backend",
        "docs": "/docs",
        "endpoints": [
            "/api/upload (POST) - Upload PDF",
            "/api/ask (POST) - Ask question",
            "/api/health (GET) - Health check",
        ],
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
