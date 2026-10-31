const DEFAULT_API_BASE =
  process.env.REACT_APP_API_BASE ||
  "http://127.0.0.1:8000";

async function requestJson(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      let detail = `Request failed (${res.status})`;
      try {
        const body = await res.json();
        detail = body?.detail || detail;
      } catch {
        // response body wasn't JSON, keep the generic message
      }
      throw new Error(detail);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const listChats = (apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/chats`);

export const createChat = (title, apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || null }),
  });

export const updateChat = (id, payload, apiBase = DEFAULT_API_BASE) =>
  requestJson(
    `${apiBase}/api/chats/${id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    15000
  );

export const deleteChat = (id, apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/chats/${id}`, { method: "DELETE" });

export const listDocuments = (apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/documents`);

export const deleteDocument = (id, apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/documents/${id}`, { method: "DELETE" });

export const getMarket = (apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/market`, {}, 10000);

export const translateFinancialTable = (file, apiBase = DEFAULT_API_BASE) => {
  const formData = new FormData();
  formData.append("file", file);
  return requestJson(
    `${apiBase}/api/translate_financial_table`,
    { method: "POST", body: formData },
    60000
  );
};

export const startDocumentTranslation = (file, sourceLang, targetLang, apiBase = DEFAULT_API_BASE) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source_lang", sourceLang);
  formData.append("target_lang", targetLang);
  return requestJson(
    `${apiBase}/api/translate_document`,
    { method: "POST", body: formData },
    30000
  );
};

export const getTranslationResult = (resultId, apiBase = DEFAULT_API_BASE) =>
  requestJson(`${apiBase}/api/chat/results/${resultId}`, {}, 10000);

export const getTranslationDownloadUrl = (resultId, apiBase = DEFAULT_API_BASE) =>
  `${apiBase}/api/translate_document/download/${resultId}`;
