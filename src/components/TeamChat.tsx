import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { MessageCircle, Send, X, Users } from "lucide-react";

type ChatMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: { display_name: string | null; email: string | null };
};

export function TeamChat({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Hydrate
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("project_chat_messages")
        .select("id,user_id,content,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(200);
      const rows = (data ?? []) as ChatMessage[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        rows.forEach((r) => {
          r.author = map.get(r.user_id);
        });
      }
      setMessages(rows);
    })();
  }, [projectId, user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`project_chat:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_chat_messages",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const m = payload.new as ChatMessage;
          if (m.user_id !== user.id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id,display_name,email")
              .eq("id", m.user_id)
              .maybeSingle();
            m.author = prof ?? undefined;
            if (!open) setUnread((u) => u + 1);
          }
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId, user, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [open, messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !user) return;
    setSending(true);
    const { error } = await supabase
      .from("project_chat_messages")
      .insert({ project_id: projectId, user_id: user.id, content: text });
    setSending(false);
    if (error) return;
    setDraft("");
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-border px-2 sm:px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-surface"
        aria-label="Team chat"
        title="Team chat"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Team chat</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-6rem))] bg-background/95 backdrop-blur-xl rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-glow" />
              <h3 className="font-semibold text-sm">Team Chat</h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">
                No messages yet. Say hi to your team 👋
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.user_id === user?.id;
                const name = m.author?.display_name ?? m.author?.email?.split("@")[0] ?? "Teammate";
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className="text-[10px] text-muted-foreground mb-0.5 px-1">
                      {mine ? "You" : name} ·{" "}
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] break-words ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-elevated rounded-bl-sm"}`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-border p-2 flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message your team…"
              maxLength={2000}
              className="flex-1 min-w-0 rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
