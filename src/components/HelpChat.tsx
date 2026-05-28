import { useState, useRef, useEffect, type FormEvent } from "react";
import { MessageCircle, X, Send, Loader2, RotateCcw, Trash2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "bloxsmith.helpchat.history";
const STORAGE_OPEN_KEY = "bloxsmith.helpchat.open";
const MAX_STORED_TURNS = 12;

const SUGGESTED = [
  "How do I install the Studio plugin?",
  "How do credits and pricing work?",
  "How do I design clothing or accessories?",
  "How do I build a game with the AI?",
];

function loadHistory(): Message[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m: unknown): m is Message =>
          !!m &&
          typeof m === "object" &&
          "role" in m &&
          ((m as Message).role === "user" || (m as Message).role === "assistant") &&
          typeof (m as Message).content === "string",
      )
      .slice(-MAX_STORED_TURNS);
  } catch {
    return [];
  }
}

function saveHistory(history: Message[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
  } catch {
    // ignore quota
  }
}

export function HelpChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Restore history + open state once on mount.
  useEffect(() => {
    setMessages(loadHistory());
    if (typeof localStorage !== "undefined") {
      setOpen(localStorage.getItem(STORAGE_OPEN_KEY) === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_OPEN_KEY, open ? "1" : "0");
    }
  }, [open]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    setLastFailed(null);
    setInput("");
    const priorHistory = messages.slice(-8);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setSending(true);
    try {
      const res = await fetch("/api/public/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: priorHistory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data?.message === "string"
            ? data.message
            : "Sorry — I couldn't answer that. Please try again.",
        );
        setLastFailed(trimmed);
        return;
      }
      const reply = typeof data?.reply === "string" ? data.reply : "";
      if (!reply) {
        setError("No reply received — please try again.");
        setLastFailed(trimmed);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setError("Network error — check your connection and try again.");
      setLastFailed(trimmed);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(input);
  }

  function retry() {
    if (lastFailed) send(lastFailed);
  }

  function clearChat() {
    setMessages([]);
    setError(null);
    setLastFailed(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <>
      {/* Launcher — fixed to the LEFT edge, vertically centered, compact. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open BloxSmith help"
          className="fixed left-0 top-1/2 z-[9998] -translate-y-1/2 flex items-center gap-2 rounded-r-xl border border-l-0 border-border bg-surface-elevated/95 backdrop-blur px-2.5 py-3 text-primary shadow-lg hover:bg-surface-elevated hover:pl-3.5 transition-all"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="hidden sm:inline text-xs font-semibold pr-1">Help</span>
        </button>
      )}

      {/* Backdrop on mobile so the compact panel reads as a sheet. */}
      {open && (
        <div
          className="fixed inset-0 z-[9998] bg-black/40 sm:bg-transparent sm:pointer-events-none"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Compact LEFT-docked panel. Narrow, scrollable, never full-screen on desktop. */}
      {open && (
        <aside
          role="dialog"
          aria-label="BloxSmith help chat"
          className="fixed left-0 top-0 z-[9999] flex h-[100dvh] w-[88vw] max-w-[340px] flex-col border-r border-border bg-surface-elevated/98 backdrop-blur-xl shadow-2xl sm:top-3 sm:left-3 sm:h-[min(560px,calc(100dvh-1.5rem))] sm:rounded-2xl sm:border"
        >
          <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-7 w-7 shrink-0 rounded-full bg-primary/15 grid place-items-center">
                <MessageCircle className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-tight">BloxSmith Help</div>
                <div className="truncate text-[10px] text-muted-foreground leading-tight">
                  Plugin, credits, building, clothing &amp; more
                </div>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  aria-label="Clear conversation"
                  title="Clear"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help"
                className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-2.5"
          >
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hi! I'm the BloxSmith help bot. Ask about the Studio plugin, credits, building
                  games, clothing &amp; accessories, assets, or how anything on the site works.
                </p>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Try asking
                  </div>
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="w-full text-left rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs hover:border-primary/50 hover:bg-surface transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 border border-border text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive space-y-1.5">
                <div>{error}</div>
                {lastFailed && !sending && (
                  <button
                    type="button"
                    onClick={retry}
                    className="inline-flex items-center gap-1.5 rounded-md bg-destructive/15 px-2 py-1 text-[11px] font-medium hover:bg-destructive/25 transition"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-border p-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask a question…"
              disabled={sending}
              maxLength={1500}
              rows={1}
              className="min-w-0 flex-1 resize-none rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs leading-relaxed focus:outline-none focus:border-primary/50 disabled:opacity-50 max-h-24"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="h-9 w-9 shrink-0 grid place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
