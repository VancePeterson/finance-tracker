import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";

interface Turn {
  question: string;
  answer?: string;
  error?: string;
  duration_ms?: number;
}

export default function Chat() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ask = useMutation({
    mutationFn: (q: string) => api.ask(q),
    onMutate: (q) => {
      setTurns((t) => [...t, { question: q }]);
    },
    onSuccess: (data) => {
      setTurns((t) => {
        const last = t[t.length - 1];
        return [...t.slice(0, -1), { ...last, answer: data.answer, duration_ms: data.duration_ms }];
      });
    },
    onError: (e: Error) => {
      setTurns((t) => {
        const last = t[t.length - 1];
        return [...t.slice(0, -1), { ...last, error: e.message }];
      });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, ask.isPending]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    ask.mutate(q);
  };

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Ask Claude</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          read-only · answers questions about your data and the app
        </span>
      </div>

      {turns.length > 0 && (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 360,
            overflowY: "auto",
            margin: "12px 0",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {turns.map((t, i) => (
            <div key={i}>
              <div
                style={{
                  background: "var(--panel-2)",
                  padding: "8px 12px",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                <strong style={{ color: "var(--text-dim)", fontSize: 12 }}>You</strong>
                <div style={{ whiteSpace: "pre-wrap" }}>{t.question}</div>
              </div>
              {t.answer !== undefined ? (
                <div style={{ padding: "8px 12px" }}>
                  <strong style={{ color: "var(--accent)", fontSize: 12 }}>Claude</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{t.answer}</div>
                  {t.duration_ms != null && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {(t.duration_ms / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ) : t.error ? (
                <div className="error" style={{ padding: "8px 12px" }}>{t.error}</div>
              ) : (
                <div className="spinner" style={{ padding: "8px 12px" }}>
                  thinking…
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="row" style={{ marginTop: 12 }}>
        <input
          type="text"
          placeholder="e.g. how much did I spend on dining last month?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={ask.isPending}
          style={{ flex: 1 }}
        />
        <button type="submit" className="primary" disabled={!question.trim() || ask.isPending}>
          {ask.isPending ? "asking…" : "ask"}
        </button>
      </form>
    </div>
  );
}
