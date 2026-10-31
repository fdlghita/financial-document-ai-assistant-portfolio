import { useEffect, useState, useRef } from "react";
import DynamicTable from './DynamicTable';

/** Render a subset of markdown inline: **bold**, *italic*, [Source: N] badges */
const renderInlineMarkdown = (text) => {
  if (!text) return null;
  // Split on **bold**, *italic*, and [Source: N] patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[Source:[^\]]+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("[Source:")) {
      return (
        <span key={i} className="source-badge">
          {part.slice(1, -1)}
        </span>
      );
    }
    // Preserve line breaks
    return part.split("\n").map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
};

function ChatComponent({
  apiBase,
  messages = [],
  setMessages,
  onTitleChange,
  draftPrompt = "",
  companyContext = "",
  documentSource,
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const pollingIntervals = useRef(new Map());
  const accContentRef = useRef("");

  useEffect(() => {
    if (draftPrompt) {
      setInput(draftPrompt);
    }
  }, [draftPrompt]);

  // This new useEffect handles polling for background task results
  useEffect(() => {
    messages.forEach((msg, index) => {
      if (msg.content_type === 'translation_started' && msg.result_id && !pollingIntervals.current.has(msg.result_id)) {
        const intervalId = setInterval(async () => {
          try {
            const response = await fetch(`${apiBase}/api/chat/results/${msg.result_id}`);
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            const result = await response.json();

            if (result.status === 'completed' || result.status === 'error') {
              clearInterval(pollingIntervals.current.get(msg.result_id));
              pollingIntervals.current.delete(msg.result_id);

              setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                if (result.status === 'completed') {
                  newMessages[index] = {
                    ...newMessages[index],
                    content_type: 'financial_table',
                    data: result.data,
                    content: result.message || "Voici les données extraites et traduites :",
                  };
                } else { // error
                  newMessages[index] = {
                    ...newMessages[index],
                    content_type: 'text',
                    content: `Erreur lors de l'analyse : ${result.message}`,
                  };
                }
                return newMessages;
              });
            }
          } catch (error) {
            console.error("Polling error:", error);
            clearInterval(pollingIntervals.current.get(msg.result_id));
            pollingIntervals.current.delete(msg.result_id);
            setMessages(prevMessages => {
                const newMessages = [...prevMessages];
                newMessages[index] = {
                    ...newMessages[index],
                    content_type: 'text',
                    content: "Une erreur est survenue lors de la récupération du résultat de l'analyse.",
                };
                return newMessages;
            });
          }
        }, 3000); // Poll every 3 seconds

        pollingIntervals.current.set(msg.result_id, intervalId);
      }
    });

    // Cleanup intervals on component unmount
    return () => {
      pollingIntervals.current.forEach(intervalId => clearInterval(intervalId));
    };
  }, [messages, apiBase, setMessages]);


  const sendQuestion = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    if (onTitleChange) {
      onTitleChange(trimmed);
    }
    setInput("");
    setLoading(true);
    setStatusText("Generation en cours...");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const contextTurns = companyContext
        ? [{ role: "user", content: `Contexte: societe ${companyContext}.` }]
        : [];

      const response = await fetch(`${apiBase}/api/ask_stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          question: trimmed,
          history: [
            ...contextTurns,
            ...[...messages, { role: "user", content: trimmed }]
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
          ],
          source: documentSource || undefined,
        }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.detail || "Server error");
      }

      accContentRef.current = "";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          sources: 0,
          sourceRefs: [],
        },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          buffer += decoder.decode(result.value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.startsWith("data:")) continue;
            const dataString = part.replace(/^data:\s?/, "");
            try {
              const chunk = JSON.parse(dataString);
              // Mutate ref OUTSIDE the updater so StrictMode's double-invoke doesn't double it
              if (!chunk.content_type) {
                accContentRef.current += (chunk.content || "");
              }
              const captured = accContentRef.current;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  if (chunk.content_type === "financial_table") {
                    last.content_type = "financial_table";
                    last.data = chunk.data;
                    last.intro = chunk.content; // pinned header
                    last.content = "";           // LLM analysis streams here
                  } else if (chunk.content_type === "translation_started") {
                    last.content_type = "translation_started";
                    last.result_id = chunk.result_id;
                    last.content = chunk.content;
                  } else {
                    last.content = captured;
                  }
                }
                return next;
              });
            } catch (e) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last) last.content = (last.content || "") + dataString;
                return next;
              });
            }
          }
        }
      }
    } catch (err) {
      const message = err.name === "AbortError"
        ? "Timeout: le modele a pris trop de temps. Pose une question plus courte."
        : (String(err.message || "").toLowerCase().includes("failed to fetch")
          ? "Le serveur backend est indisponible. Verifiez que l'API tourne sur http://127.0.0.1:8000."
          : `Error: ${err.message}`);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="chat-header">
        <div>
          <h2>Assistant Analyste</h2>
          <p>Analyse des rapports financiers et signaux marche.</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-2xl rounded-lg px-4 py-2 ${
                msg.role === "user"
                  ? "bg-brand-navy text-white"
                  : "bg-brand-surface text-brand-ink"
              }`}
            >
              {/* New Rendering Logic */}
              {msg.content_type === 'financial_table' ? (
                <div>
                  {msg.intro && <p className="mb-3">{msg.intro}</p>}
                  <DynamicTable data={msg.data} />
                  {msg.content && (
                    <p className="mt-4 whitespace-pre-wrap text-gray-700">
                      {renderInlineMarkdown(msg.content)}
                    </p>
                  )}
                </div>
              ) : msg.content_type === 'translation_started' ? (
                <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{msg.content}</span>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{renderInlineMarkdown(msg.content)}</p>
              )}
            </div>
          </div>
        ))}
        {/* ... (existing loading indicator) ... */}
      </div>

      <div className="chat-composer">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Posez votre question..."
        />
        <button type="button" onClick={sendQuestion} disabled={loading || !input.trim()}>
          {loading ? "Analyse..." : "Envoyer"}
        </button>
      </div>
      {statusText && <div className="chat-status">{statusText}</div>}
    </div>
  );
}

export default ChatComponent;
