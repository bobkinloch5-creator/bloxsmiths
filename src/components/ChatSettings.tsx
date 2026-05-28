import { useEffect, useRef, useState } from "react";
import {
  Settings,
  Brain,
  Zap,
  ClipboardList,
  Trash2,
  X,
  Cpu,
  Plus,
  Plug,
  Key,
  CreditCard,
  User as UserIcon,
  Server,
  ExternalLink,
  Hand,
  Volume2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { soundsEnabled, setSoundsEnabled } from "@/hooks/useSounds";

type Props = {
  thinking: boolean;
  onToggleThinking: (v: boolean) => void;
  autoExecute: boolean;
  onToggleAutoExecute: (v: boolean) => void;
  planMode: boolean;
  onTogglePlanMode: (v: boolean) => void;
  onClearChat: () => void;
  canClearChat: boolean;
  studioConnected: boolean;
  projectId?: string;
};

type McpServer = {
  id: string;
  name: string;
  url: string;
  auth_header: string | null;
  enabled: boolean;
};

function Toggle({ checked }: { checked: boolean }) {
  return (
    <div
      className={`mt-0.5 h-4 w-7 rounded-full transition relative shrink-0 ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-background transition-all ${checked ? "left-3.5" : "left-0.5"}`}
      />
    </div>
  );
}

function Row({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-left hover:bg-surface-elevated transition"
    >
      <div className="mt-0.5 text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Toggle checked={checked} />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-2">
      {children}
    </div>
  );
}

function McpServersSection() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", auth_header: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_mcp_servers")
      .select("id,name,url,auth_header,enabled")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setServers((data as McpServer[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      toast.error("Please sign in.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("user_mcp_servers").insert({
      user_id: u.user.id,
      name: form.name.trim(),
      url: form.url.trim(),
      auth_header: form.auth_header.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("MCP server added");
    setForm({ name: "", url: "", auth_header: "" });
    setAdding(false);
    load();
  };

  const toggle = async (s: McpServer) => {
    const { error } = await supabase
      .from("user_mcp_servers")
      .update({ enabled: !s.enabled })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (s: McpServer) => {
    if (!confirm(`Remove ${s.name}?`)) return;
    const { error } = await supabase.from("user_mcp_servers").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    load();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionTitle>MCP servers</SectionTitle>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[10px] inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
        >
          <Plus className="h-3 w-3" /> {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={add}
          className="space-y-1.5 rounded-lg border border-border bg-background/40 p-2"
        >
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name (e.g. notion)"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs focus:outline-none focus:border-primary/50"
          />
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://mcp.example.com/mcp"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs focus:outline-none focus:border-primary/50"
          />
          <input
            value={form.auth_header}
            onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
            placeholder="Bearer token (optional)"
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs focus:outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add server"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-[11px] text-muted-foreground px-1">Loading…</p>
      ) : servers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-1">No MCP servers connected.</p>
      ) : (
        <ul className="space-y-1.5">
          {servers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2"
            >
              <Server className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{s.url}</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(s)}
                title={s.enabled ? "Disable" : "Enable"}
              >
                <Toggle checked={s.enabled} />
              </button>
              <button
                onClick={() => remove(s)}
                className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-surface-elevated transition"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to="/mcp-servers"
        className="block text-[10px] text-muted-foreground hover:text-foreground px-1"
      >
        Manage in full page →
      </Link>
    </div>
  );
}

function StudioSyncSection() {
  const [manualOnly, setManualOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("manual_sync_only")
        .eq("id", user.id)
        .maybeSingle();
      setManualOnly(!!data?.manual_sync_only);
      setLoading(false);
    })();
  }, []);

  async function toggle() {
    const next = !manualOnly;
    setManualOnly(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ manual_sync_only: next })
      .eq("id", user.id);
    if (error) {
      setManualOnly(!next);
      toast.error("Couldn't save setting");
    } else {
      toast.success(
        next ? "Manual sync only — click Sync Now in Studio to apply" : "Auto-sync enabled",
      );
    }
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Studio sync</SectionTitle>
      <Row
        icon={<Hand className="h-3.5 w-3.5" />}
        title="Manual sync only"
        desc="Never auto-apply queued actions in Studio. Use the Sync Now button to pull."
        checked={manualOnly}
        onChange={loading ? () => {} : toggle}
      />
    </div>
  );
}

function ProjectRulesSection({ projectId }: { projectId: string }) {
  const [rules, setRules] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("ai_rules")
        .eq("id", projectId)
        .maybeSingle();
      if (cancel) return;
      setRules(((data as any)?.ai_rules as string) ?? "");
      setLoaded(true);
    })();
    return () => {
      cancel = true;
    };
  }, [projectId]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ ai_rules: rules.trim() || null })
      .eq("id", projectId);
    setSaving(false);
    if (error) return toast.error(error.message);
    setDirty(false);
    toast.success("Project rules saved");
  }

  return (
    <div className="space-y-2">
      <SectionTitle>Project AI rules</SectionTitle>
      <p className="text-[11px] text-muted-foreground px-1">
        Injected into every AI request for this project. Use it for naming conventions, code style,
        do/don'ts.
      </p>
      <textarea
        value={rules}
        disabled={!loaded}
        onChange={(e) => {
          setRules(e.target.value);
          setDirty(true);
        }}
        placeholder={
          loaded
            ? "e.g. Always use PascalCase for parts. Put all RemoteEvents under ReplicatedStorage/Remotes. Prefer ModuleScripts over Scripts."
            : "Loading…"
        }
        rows={5}
        maxLength={4000}
        className="w-full resize-y rounded-lg border border-border bg-background/40 px-2.5 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
      />
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground tabular-nums">{rules.length}/4000</span>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  );
}

function LinkRow({
  icon,
  title,
  desc,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 hover:bg-surface-elevated transition"
    >
      <div className="text-primary">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">{desc}</div>
      </div>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </Link>
  );
}

export function ChatSettings(props: Props) {
  const [open, setOpen] = useState(false);
  // Start with the SSR-safe default (off) and read localStorage in an
  // effect so the server-rendered HTML matches the first client render.
  // Reading localStorage in a lazy state initializer caused React error
  // #419 (hydration mismatch) for users who had previously enabled sounds.
  const [sounds, setSounds] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSounds(soundsEnabled());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Chat settings"
        className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside
            ref={ref}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-full max-w-sm border-l border-border bg-surface shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Settings</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <div className="space-y-2">
                <SectionTitle>Chat behavior</SectionTitle>
                <Row
                  icon={<Brain className="h-3.5 w-3.5" />}
                  title="Thinking mode"
                  desc="Spend more compute for deeper reasoning."
                  checked={props.thinking}
                  onChange={props.onToggleThinking}
                />
                <Row
                  icon={<ClipboardList className="h-3.5 w-3.5" />}
                  title="Plan first"
                  desc="Draft a plan before writing files."
                  checked={props.planMode}
                  onChange={props.onTogglePlanMode}
                />
                <Row
                  icon={<Zap className="h-3.5 w-3.5" />}
                  title="Auto-build safe ops"
                  desc="Execute non-destructive actions in Studio automatically."
                  checked={props.autoExecute}
                  onChange={props.onToggleAutoExecute}
                />
                <Row
                  icon={<Volume2 className="h-3.5 w-3.5" />}
                  title="Sound effects"
                  desc="Chime when the AI starts and finishes. Off by default."
                  checked={sounds}
                  onChange={(v) => {
                    setSounds(v);
                    setSoundsEnabled(v);
                  }}
                />
              </div>

              <div className="space-y-2">
                <SectionTitle>Model</SectionTitle>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2 flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">Groq · tools enabled</div>
                    <div className="text-[10px] text-muted-foreground">
                      {props.studioConnected ? "Studio live" : "Studio waiting"}
                    </div>
                  </div>
                </div>
              </div>

              <StudioSyncSection />

              {props.projectId && <ProjectRulesSection projectId={props.projectId} />}

              <McpServersSection />

              <div className="space-y-2">
                <SectionTitle>Account & integrations</SectionTitle>
                <LinkRow
                  icon={<Plug className="h-3.5 w-3.5" />}
                  title="Studio plugin"
                  desc="Install & connect the BloxSmith plugin"
                  to="/plugin"
                />
                <LinkRow
                  icon={<Key className="h-3.5 w-3.5" />}
                  title="MCP API token"
                  desc="Generate or revoke your MCP key"
                  to="/mcp"
                />
                <LinkRow
                  icon={<UserIcon className="h-3.5 w-3.5" />}
                  title="Account"
                  desc="Profile, credits, referrals, Discord"
                  to="/account"
                />
                <LinkRow
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                  title="Pricing"
                  desc="Buy more credits"
                  to="/pricing"
                />
              </div>

              <div className="space-y-2">
                <SectionTitle>Danger zone</SectionTitle>
                <button
                  onClick={() => {
                    props.onClearChat();
                    setOpen(false);
                  }}
                  disabled={!props.canClearChat}
                  className="w-full flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear chat history
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
