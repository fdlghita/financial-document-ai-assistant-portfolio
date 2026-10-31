from __future__ import annotations

import os
import json
import threading
import urllib.request
import urllib.error
from langchain_core.language_models import BaseChatModel


class _LlamaCppDirect:
    """
    Thin wrapper around llama.cpp server's OpenAI-compatible API (/v1/chat/completions).
    No extra packages needed — uses stdlib urllib.
    """

    # Shared across every instance (translation background tasks each build their own
    # _LlamaCppDirect via get_llm()). llama.cpp is a single local inference slot: firing
    # concurrent requests at it (e.g. two translation jobs, or a translation job plus an
    # Assistant question) doesn't run them in parallel, it makes both crawl and can starve
    # the FastAPI process of CPU for seconds at a time — which is what caused requests to
    # the server to time out from the client's point of view. Serializing all calls here
    # means requests queue politely instead of contending.
    _lock = threading.Lock()

    def __init__(self, base_url: str = "http://localhost:8080", temperature: float = 0.0):
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature

    def invoke(self, messages) -> object:
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        api_messages = []
        for msg in messages:
            if isinstance(msg, SystemMessage):
                api_messages.append({"role": "system", "content": msg.content})
            elif isinstance(msg, HumanMessage):
                api_messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                api_messages.append({"role": "assistant", "content": msg.content})

        payload = json.dumps({
            "messages": api_messages,
            "temperature": self.temperature,
            "max_tokens": 512,
            "stream": False,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with self._lock:
                with urllib.request.urlopen(req, timeout=300) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as e:
            if "Connection refused" in str(e) or "10061" in str(e):
                raise RuntimeError(
                    "Le serveur llama.cpp n'est pas demarre. "
                    "Lancez start_llama.bat ou: llama-server -m models/Qwen2.5-3B-Instruct-Q4_K_M.gguf --port 8080"
                ) from e
            raise

        text = data["choices"][0]["message"]["content"]

        class _Result:
            def __init__(self, text: str):
                self.content = text

        return _Result(text or "")


class _GeminiDirect:
    """
    Thin wrapper around google-genai SDK that exposes the same .invoke() interface
    as LangChain chat models, avoiding langchain-google-genai version conflicts.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash-lite", temperature: float = 0.0):
        from google import genai
        self.client = genai.Client(api_key=api_key)
        # SDK expects short name, not "models/xxx"
        self.model = model.removeprefix("models/")
        self.temperature = temperature

    def invoke(self, messages) -> object:
        from google.genai import types as gtypes
        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

        system_text = ""
        contents = []

        for msg in messages:
            if isinstance(msg, SystemMessage):
                system_text = msg.content
            elif isinstance(msg, HumanMessage):
                contents.append(
                    gtypes.Content(role="user", parts=[gtypes.Part(text=msg.content)])
                )
            elif isinstance(msg, AIMessage):
                contents.append(
                    gtypes.Content(role="model", parts=[gtypes.Part(text=msg.content)])
                )

        config = gtypes.GenerateContentConfig(
            temperature=self.temperature,
            system_instruction=system_text or None,
            max_output_tokens=2048,
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        class _Result:
            def __init__(self, text: str):
                self.content = text

        return _Result(response.text or "")


def get_llm(
    model: str = "llama3.2:3b",
    base_url: str = "http://localhost:11434",
    temperature: float = 0.0,
):
    """
    Return a chat model. Priority:
      1. LLAMA_CPP_URL is set  → llama.cpp server (local, no API key)
      2. GEMINI_API_KEY is set → Gemini via google-genai SDK
      3. Fallback              → local Ollama model
    """
    llama_url = os.getenv("LLAMA_CPP_URL")
    if llama_url:
        return _LlamaCppDirect(base_url=llama_url, temperature=temperature)

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")
        return _GeminiDirect(api_key=gemini_key, model=gemini_model, temperature=temperature)

    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=model,
        base_url=base_url,
        temperature=temperature,
        num_predict=512,
        num_ctx=4096,
    )
