import { useEffect, useRef, useState } from "react";

import { api } from "../api";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What entered the cut that was never in the script?",
  "For the riskiest item, who do I contact first and what do I ask for?",
  "Has anything changed recently for the artwork?",
];

export default function Copilot({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    try {
      const { answer } = await api.ask(projectId, trimmed, `chat-${projectId}`);
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Something went wrong: ${(error as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Copilot</span>
        <span className="plain">Gemini + Parallel Search</span>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && !busy && (
          <div>
            <div className="chat-empty">
              Ask about the project. If the evidence doesn’t cover it, the agent runs a
              live search and cites sources. It cannot approve anything.
            </div>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} className="suggestion" onClick={() => send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div className={`msg ${message.role}`} key={index}>
            {message.text}
          </div>
        ))}

        {busy && (
          <div className="msg assistant" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="spinner" />
            Thinking, and searching if needed…
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          placeholder="Ask about clearance…"
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
        <button className="btn primary small" type="submit" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
