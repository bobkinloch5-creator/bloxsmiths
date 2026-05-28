import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Megaphone, Youtube, CheckCircle2, XCircle, Clock } from "lucide-react";

type Submission = {
  id: string;
  platform: "tiktok" | "youtube" | "other";
  url: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  credits_awarded: number;
  reject_reason: string | null;
  created_at: string;
};

function detectPlatform(url: string): "tiktok" | "youtube" | "other" {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return "other";
}

export function PromoteAndEarn() {
  const [items, setItems] = useState<Submission[]>([]);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("promotion_submissions")
      .select("id,platform,url,note,status,credits_awarded,reject_reason,created_at")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Submission[]);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      return toast.error("Please enter a valid URL");
    }
    const platform = detectPlatform(trimmed);
    if (platform === "other") {
      return toast.error("Only TikTok or YouTube links are accepted");
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      setSaving(false);
      return toast.error("Please sign in");
    }
    const { error } = await supabase.from("promotion_submissions").insert({
      user_id: u.user.id,
      platform,
      url: trimmed,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Submitted! We'll review it within 24-48h.");
    setUrl("");
    setNote("");
    load();
  };

  return (
    <section className="rounded-2xl border border-border/50 bg-surface/20 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" /> Promote & Earn Credits
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Make a video about BloxSmith on TikTok or YouTube and earn free credits when it's
          approved.
        </p>
      </div>

      <ul className="text-xs text-muted-foreground grid grid-cols-1 sm:grid-cols-3 gap-2">
        <li className="rounded-lg border border-border/50 p-3">
          <div className="text-foreground font-semibold mb-0.5">TikTok / Shorts</div>
          Up to <span className="text-success font-semibold">50 credits</span>
        </li>
        <li className="rounded-lg border border-border/50 p-3">
          <div className="text-foreground font-semibold mb-0.5">YouTube video</div>
          Up to <span className="text-success font-semibold">150 credits</span>
        </li>
        <li className="rounded-lg border border-border/50 p-3">
          <div className="text-foreground font-semibold mb-0.5">Viral bonus</div>
          Extra credits for 10k+ views
        </li>
      </ul>

      <form onSubmit={submit} className="space-y-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@you/video/... or https://youtu.be/..."
          className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (e.g. video title, views so far)"
          className="w-full rounded-lg bg-surface-elevated border border-border px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !url.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit for review"}
          </button>
          <p className="text-xs text-muted-foreground">
            Video must mention BloxSmith and link back to bloxsmith.pro.
          </p>
        </div>
      </form>

      {items.length > 0 && (
        <div className="border-t border-border/50 pt-3 space-y-2">
          <div className="text-xs uppercase text-muted-foreground">Your submissions</div>
          <ul className="space-y-2">
            {items.map((s) => (
              <li
                key={s.id}
                className="text-xs rounded-lg border border-border/50 p-3 flex flex-wrap items-center gap-2 justify-between"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {s.platform === "youtube" ? (
                    <Youtube className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <Megaphone className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate underline hover:text-foreground max-w-[280px]"
                  >
                    {s.url}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "pending" && (
                    <span className="inline-flex items-center gap-1 text-amber-500">
                      <Clock className="h-3.5 w-3.5" /> Pending review
                    </span>
                  )}
                  {s.status === "approved" && (
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" /> +{s.credits_awarded} credits
                    </span>
                  )}
                  {s.status === "rejected" && (
                    <span
                      className="inline-flex items-center gap-1 text-destructive"
                      title={s.reject_reason ?? undefined}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Rejected
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
