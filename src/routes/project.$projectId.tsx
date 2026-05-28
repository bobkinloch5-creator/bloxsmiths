import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/layout";
import { AiSourceSettings } from "@/components/AiSourceSettings";
import { ModelPicker } from "@/components/ModelPicker";
import { useAiBusySounds } from "@/hooks/useSounds";

import { useAuth } from "@/lib/auth-context";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  generateWithAI,
  fixErrorsWithAI,
  autopilotBuild,
  planBuild,
  queuePluginAction,
  improvePrompt,
  chatWithAI,
} from "@/lib/ai.functions";
import {
  Loader2,
  Plus,
  Send,
  Trash2,
  FileCode,
  ArrowLeft,
  Save,
  Download,
  Bug,
  X,
  Rocket,
  MessageSquare,
  Folder,
  ClipboardList,
  Hammer,
  ShieldCheck,
  Sparkles,
  Wand2,
  User as UserIcon,
  Brain,
  Code2,
  Database,
  Gamepad2,
  Zap,
  CheckCircle2,
  RefreshCw,
  Box,
  Plug,
  Search,
  AlertCircle,
  PanelLeft,
  PanelRight,
  Square,
  Mic,
  MicOff,
  History,
  ImagePlus,
  Globe,
  Shirt,
} from "lucide-react";
import { toast } from "sonner";
import { downloadRbxmx } from "@/lib/rbxmx-export";
import { PublishToRobloxButton } from "@/components/PublishToRobloxButton";
import { ShowcasePublishButton } from "@/components/ShowcasePublishButton";
import { PluginStatus } from "@/components/PluginStatus";
import { PushPreview, type PreviewPayload } from "@/components/PushPreview";
import { ChatSettings } from "@/components/ChatSettings";
import { SyncValidationDrawer } from "@/components/SyncValidationDrawer";
import { AssistantMessage } from "@/components/AssistantMessage";
import { BuildHistoryDrawer } from "@/components/BuildHistoryDrawer";
import { OrganizeProjectButton } from "@/components/OrganizeProjectButton";
import { TaskBoard } from "@/components/TaskBoard";
import { MessagesSquare, Kanban } from "lucide-react";

export const Route = createFileRoute("/project/$projectId")({
  component: ProjectEditor,
  head: () => ({ meta: [{ title: "Project — BloxSmith" }] }),
});

type ProjectFile = {
  id: string;
  project_id: string;
  path: string;
  file_type: string;
  service_location: string;
  content: string;
  updated_at: string;
};
type Project = {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  user_id: string;
};
type Msg = { id: string; role: "user" | "assistant"; content: string; actions?: any };

function ProjectEditor() {
  const { projectId } = Route.useParams();
  const { user, session, loading } = useAuth();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);

  // Auto Execute State
  const [autoExecute, setAutoExecute] = useState(
    () => localStorage.getItem("bs_auto_execute") !== "false",
  );
  const toggleAutoExecute = (val: boolean) => {
    setAutoExecute(val);
    localStorage.setItem("bs_auto_execute", String(val));
  };

  // Resizable AI chat panel (drag the handle on its left edge)
  const [chatWidth, setChatWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const v = Number(localStorage.getItem("bs_chat_width"));
    return Number.isFinite(v) && v >= 320 && v <= 900 ? v : 420;
  });
  const resizing = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const next = Math.min(900, Math.max(320, window.innerWidth - e.clientX));
      setChatWidth(next);
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("bs_chat_width", String(chatWidth));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [chatWidth]);

  // Collapsible side panels (desktop). Persisted.
  const [showFiles, setShowFiles] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bs_show_files") !== "false";
  });
  const [showChat, setShowChat] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bs_show_chat") !== "false";
  });
  const toggleFiles = (v: boolean) => {
    setShowFiles(v);
    localStorage.setItem("bs_show_files", String(v));
  };
  const toggleChat = (v: boolean) => {
    setShowChat(v);
    localStorage.setItem("bs_show_chat", String(v));
  };

  // Stop button for in-flight AI generations
  const stopRequested = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const stopGeneration = () => {
    stopRequested.current = true;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiBusy(false);
    setAutoBusy(false);
    setFixBusy(false);
    setImproving(false);
    setAutoFixingMsg(null);
    toast.message("Generation stopped");
  };

  // Microphone dictation (Web Speech API)
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const toggleMic = () => {
    const SR: any =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      toast.error("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    let base = "";
    rec.onstart = () => {
      base = prompt ? prompt.trimEnd() + " " : "";
      setListening(true);
    };
    rec.onresult = (e: any) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setPrompt(base + finalText + interim);
      if (finalText) base += finalText;
    };
    rec.onerror = (e: any) => {
      console.warn("[speech]", e);
      if (e.error === "not-allowed") toast.error("Microphone permission denied.");
    };
    rec.onend = () => {
      setListening(false);
      recogRef.current = null;
    };
    recogRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      console.warn("[speech]", err);
    }
  };
  useEffect(
    () => () => {
      try {
        recogRef.current?.stop();
      } catch {}
    },
    [],
  );

  // Action status polling state
  const [actionStatuses, setActionStatuses] = useState<
    Record<
      string,
      {
        status: "pending" | "executing" | "complete" | "error" | "queued";
        error?: string;
        hint?: string;
      }
    >
  >({});

  const pollGenerationStatus = (generationId: string, msgId: string) => {
    let attempts = 0;
    // Poll every 1s for up to 10 minutes. The plugin can be offline, paused,
    // or working through a long batch — we should NOT throw a scary error
    // just because Studio hasn't checked in yet. We downgrade to a soft
    // "queued" state instead, and let the user resume by opening Studio.
    const MAX_ATTEMPTS = 600; // 10 minutes
    const interval = setInterval(async () => {
      attempts++;

      const { data, error } = await supabase
        .from("plugin_actions")
        .select("status,error_message")
        .eq("payload->>generation_id", generationId);

      if (error) {
        clearInterval(interval);
        return;
      }

      if (data && data.length > 0) {
        const statuses = data.map((a) => a.status);
        const hasFailed = statuses.includes("failed");
        const hasPendingOrDelivered = statuses.some((s) => s === "pending" || s === "delivered");

        if (hasFailed) {
          clearInterval(interval);
          const failedAction = data.find((a) => a.status === "failed");
          setActionStatuses((prev) => ({
            ...prev,
            [msgId]: {
              status: "error",
              error: failedAction?.error_message ?? "Execution failed",
            },
          }));
          return;
        }

        if (!hasPendingOrDelivered) {
          // All executed successfully
          clearInterval(interval);
          setActionStatuses((prev) => ({
            ...prev,
            [msgId]: { status: "complete" },
          }));
          return;
        }
      }

      // Still pending — surface a friendly hint after ~20s so the user knows
      // we're waiting on the plugin, not stuck.
      if (attempts === 20) {
        setActionStatuses((prev) => {
          const cur = prev[msgId];
          if (cur?.status === "complete" || cur?.status === "error") return prev;
          return {
            ...prev,
            [msgId]: {
              status: "executing",
              hint: "Still waiting for Roblox Studio. Open the BloxSmith plugin and press Sync Project to apply queued actions.",
            },
          };
        });
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
        setActionStatuses((prev) => {
          const cur = prev[msgId];
          if (cur?.status === "complete" || cur?.status === "error") return prev;
          return {
            ...prev,
            [msgId]: {
              status: "queued",
              hint: "Actions are queued and safe — they'll apply automatically the next time the BloxSmith plugin syncs in Studio.",
            },
          };
        });
      }
    }, 1000);
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convoId, setConvoId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    Array<{ id: string; title: string | null; updated_at: string }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [prompt, setPrompt] = useState("");
  // Image attachments for chat mode (vision). data: URLs, max 4, ~6MB each
  // pre-encoded — schema caps at 8.5MB encoded.
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_ATTACHMENTS = 4;
  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
  const addAttachmentFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} images.`);
      return;
    }
    const accepted = list.slice(0, slots);
    if (list.length > slots) toast.message(`Only added ${slots} more (max ${MAX_ATTACHMENTS}).`);
    const dataUrls: string[] = [];
    for (const f of accepted) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`"${f.name}" is over 6 MB — please shrink it first.`);
        continue;
      }
      const url = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result ?? ""));
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(f);
      });
      if (url.startsWith("data:image/")) dataUrls.push(url);
    }
    if (dataUrls.length) setAttachments((prev) => [...prev, ...dataUrls]);
  };
  const removeAttachment = (i: number) =>
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  const [aiBusy, setAiBusy] = useState(false);
  const [aiBusyStartedAt, setAiBusyStartedAt] = useState<number | null>(null);
  const [aiBusyElapsed, setAiBusyElapsed] = useState(0);
  const [aiBusyExpanded, setAiBusyExpanded] = useState(false);
  useEffect(() => {
    if (!aiBusy) {
      setAiBusyStartedAt(null);
      setAiBusyElapsed(0);
      return;
    }
    const start = Date.now();
    setAiBusyStartedAt(start);
    setAiBusyElapsed(0);
    const id = setInterval(() => setAiBusyElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [aiBusy]);
  useAiBusySounds(aiBusy);
  const [credits, setCredits] = useState<number | null>(null);
  const GENERATE_COST = 3;
  const outOfCredits = credits !== null && credits < GENERATE_COST;
  const [aiMode, setAiMode] = useState<string>("build");
  const runAI = useServerFn(generateWithAI);
  const runFixErrors = useServerFn(fixErrorsWithAI);
  const runAutopilot = useServerFn(autopilotBuild);
  const runQueuePluginAction = useServerFn(queuePluginAction);
  const runImprovePrompt = useServerFn(improvePrompt);
  const [improving, setImproving] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const [showFix, setShowFix] = useState(false);
  const [fixLogs, setFixLogs] = useState("");
  const [fixBusy, setFixBusy] = useState(false);
  const FIX_COST = 2;
  const [revertedByMsg, setRevertedByMsg] = useState<Record<string, boolean>>({});
  const [revertingMsg, setRevertingMsg] = useState<string | null>(null);
  const [showBuildHistory, setShowBuildHistory] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);

  const revertMessage = async (m: Msg) => {
    const snap: any[] = m.actions?.snapshot ?? [];
    if (!snap.length) return;
    if (
      !confirm(
        `Revert ${snap.length} file change${snap.length === 1 ? "" : "s"} from this AI response?\n\nThis restores old file contents, deletes anything new, and queues Studio to remove the new instances on next sync.`,
      )
    )
      return;
    setRevertingMsg(m.id);
    try {
      let restored = 0;
      let removed = 0;
      const queueDeletes: string[] = [];
      for (const s of snap) {
        const cur = files.find((x) => x.path === s.path);
        if (s.existed) {
          if (cur) {
            await supabase
              .from("project_files")
              .update({
                content: s.content ?? "",
                file_type: s.file_type ?? cur.file_type,
                service_location: s.service_location ?? cur.service_location,
              })
              .eq("id", cur.id);
            restored++;
          }
        } else {
          if (cur) {
            await supabase.from("project_files").delete().eq("id", cur.id);
          }
          queueDeletes.push(s.path);
          removed++;
        }
      }
      // Tell Studio to delete the newly-created scripts/instances on next sync.
      for (const path of queueDeletes) {
        try {
          await runQueuePluginAction({
            data: {
              projectId,
              actionType: "delete",
              payload: { type: "delete", path },
            } as any,
          });
        } catch (err) {
          // Non-fatal — DB is already reverted; surface in toast only.
          console.warn("Failed to queue Studio delete for", path, err);
        }
      }
      setRevertedByMsg((p) => ({ ...p, [m.id]: true }));
      toast.success(
        `Reverted — restored ${restored}, removed ${removed}${queueDeletes.length ? `, queued ${queueDeletes.length} Studio delete${queueDeletes.length === 1 ? "" : "s"}` : ""}.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Revert failed");
    } finally {
      setRevertingMsg(null);
    }
  };
  const AUTOPILOT_COST = 10;
  const [showAuto, setShowAuto] = useState(false);
  const [autoDesc, setAutoDesc] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<"files" | "editor" | "chat">("editor");
  const [previewsByMsg, setPreviewsByMsg] = useState<Record<string, PreviewPayload>>({});
  const [activityByMsg, setActivityByMsg] = useState<
    Record<string, Array<{ tool: string; summary: string; ok: boolean }>>
  >({});
  const [planMode, setPlanMode] = useState(false);
  const [chatMode, setChatMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("bs_chat_mode") === "true";
  });
  const toggleChatMode = (v: boolean) => {
    setChatMode(v);
    if (typeof window !== "undefined") localStorage.setItem("bs_chat_mode", String(v));
    if (v) setPlanMode(false);
  };
  const CHAT_COST = 1;
  const runChat = useServerFn(chatWithAI);
  const [thinking, setThinking] = useState(false);
  // Web-search toggle: when on, the AI is pushed to call the web_search /
  // fetch_url tools to verify facts (Luau APIs, current best practices,
  // game-design patterns) before answering / building.
  const [webSearch, setWebSearch] = useState(false);
  const [mcpServers, setMcpServers] = useState<
    Array<{ name: string; enabled: boolean; ok: boolean | null }>
  >([]);
  const [mcpClient, setMcpClient] = useState<{
    client: string | null;
    lastUsedAt: string | null;
  } | null>(null);
  const [aiSettings, setAiSettings] = useState<{
    mode: "mcp" | "api_key";
    provider: string | null;
    model: string | null;
  }>({
    mode: "mcp",
    provider: null,
    model: null,
  });
  const [showAiSourceModal, setShowAiSourceModal] = useState(false);
  const [aiUsage, setAiUsage] = useState<{
    used_5h: number;
    limit_5h: number;
    used_7d: number;
    limit_7d: number;
    owner?: boolean;
    reset_5h?: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [serversRes, tokenRes, aiRes, usageRes] = await Promise.all([
        supabase.from("user_mcp_servers").select("name,enabled,last_test_ok").eq("enabled", true),
        supabase.from("mcp_tokens").select("last_client,last_used_at").maybeSingle(),
        supabase
          .from("project_ai_settings")
          .select("mode,provider,model")
          .eq("project_id", projectId)
          .maybeSingle(),
        supabase.rpc("get_ai_usage"),
      ]);
      if (cancelled) return;
      setMcpServers(
        (
          (serversRes.data ?? []) as Array<{
            name: string;
            enabled: boolean;
            last_test_ok: boolean | null;
          }>
        ).map((s) => ({ name: s.name, enabled: s.enabled, ok: s.last_test_ok })),
      );
      const t = tokenRes.data as { last_client: string | null; last_used_at: string | null } | null;
      setMcpClient(t ? { client: t.last_client, lastUsedAt: t.last_used_at } : null);
      const a = aiRes.data as {
        mode: "mcp" | "api_key";
        provider: string | null;
        model: string | null;
      } | null;
      setAiSettings(a ?? { mode: "mcp", provider: null, model: null });
      if (usageRes.data) setAiUsage(usageRes.data as any);
    };

    load();
    const ch = supabase
      .channel("ai-indicator")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_mcp_servers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "mcp_tokens" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_ai_settings" }, load)
      .subscribe();
    const poll = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(ch);
    };
  }, [projectId]);

  const [plansByMsg, setPlansByMsg] = useState<Record<string, { prompt: string; plan: string }>>(
    {},
  );
  const runPlan = useServerFn(planBuild);
  const PLAN_COST = 1;
  const [validationByMsg, setValidationByMsg] = useState<
    Record<string, { errors: any[]; warnings: any[]; originalPrompt: string }>
  >({});
  const [autoFixingMsg, setAutoFixingMsg] = useState<string | null>(null);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [aiContext, setAiContext] = useState<{
    fileCount: number;
    instanceCount: number | null;
    updatedAt: string | null;
  } | null>(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [scanRequestedAt, setScanRequestedAt] = useState<number | null>(null);
  const [scanTimedOut, setScanTimedOut] = useState(false);

  const refreshAiContext = async () => {
    const [{ count }, { data: ctx }] = await Promise.all([
      supabase
        .from("project_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      supabase
        .from("plugin_context")
        .select("instance_count,updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);
    setAiContext({
      fileCount: count ?? 0,
      instanceCount: ctx?.instance_count ?? null,
      updatedAt: ctx?.updated_at ?? null,
    });
  };

  const refreshCredits = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle();
    if (data) setCredits(data.credits);
  };

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!p) return toast.error("Project not found");
      setProject(p as Project);
      const { data: f } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId)
        .order("path");
      setFiles((f ?? []) as ProjectFile[]);
      if ((f ?? []).length) setActiveId(f![0].id);

      refreshCredits();
      refreshAiContext();

      // Load all conversations for this project, pick the most recent (or create one).
      const { data: allConvos } = await supabase
        .from("agent_conversations")
        .select("id,title,updated_at")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setConversations((allConvos ?? []) as any);
      let cid = allConvos?.[0]?.id ?? null;
      if (!cid) {
        const { data: created } = await supabase
          .from("agent_conversations")
          .insert({ project_id: projectId, user_id: user.id, title: "New chat" })
          .select("id,title,updated_at")
          .single();
        cid = created?.id ?? null;
        if (created) setConversations([created as any]);
      }
      if (cid) {
        setConvoId(cid);
        const { data: msgs } = await supabase
          .from("agent_messages")
          .select("id,role,content,actions")
          .eq("conversation_id", cid)
          .order("created_at", { ascending: true });
        setMessages(
          (msgs ?? []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            actions: m.actions,
          })),
        );
      }
    })();
  }, [user, projectId]);

  const loadConversation = async (cid: string) => {
    setConvoId(cid);
    setShowHistory(false);
    const { data: msgs } = await supabase
      .from("agent_messages")
      .select("id,role,content,actions")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    setMessages(
      (msgs ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        actions: m.actions,
      })),
    );
  };

  const newChat = async () => {
    if (!user) return;
    const { data: created } = await supabase
      .from("agent_conversations")
      .insert({ project_id: projectId, user_id: user.id, title: "New chat" })
      .select("id,title,updated_at")
      .single();
    if (created) {
      setConversations((prev) => [created as any, ...prev]);
      setConvoId(created.id);
      setMessages([]);
      setShowHistory(false);
    }
  };

  const deleteConversation = async (cid: string) => {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    await supabase.from("agent_messages").delete().eq("conversation_id", cid);
    await supabase.from("agent_conversations").delete().eq("id", cid);
    setConversations((prev) => prev.filter((c) => c.id !== cid));
    if (cid === convoId) {
      setMessages([]);
      setConvoId(null);
      // Auto-create a fresh one
      newChat();
    }
  };

  const persistMsg = async (role: "user" | "assistant", content: string, actions?: any) => {
    if (!convoId) return null;
    const { data } = await supabase
      .from("agent_messages")
      .insert({ conversation_id: convoId, role, content, actions: actions ?? null })
      .select("id")
      .single();
    // Auto-title from first user message if still "New chat"
    const cur = conversations.find((c) => c.id === convoId);
    const patch: any = { updated_at: new Date().toISOString() };
    if (
      role === "user" &&
      cur &&
      (!cur.title || cur.title === "New chat" || cur.title === "Team Chat" || cur.title === "Chat")
    ) {
      patch.title = content.slice(0, 60).replace(/\s+/g, " ").trim() || "New chat";
    }
    await supabase.from("agent_conversations").update(patch).eq("id", convoId);
    setConversations((prev) => {
      const next = prev.map((c) => (c.id === convoId ? { ...c, ...patch } : c));
      next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
      return next;
    });
    return data?.id ?? null;
  };

  const clearChat = async () => {
    if (!convoId) return;
    if (!confirm("Clear this project's chat history?")) return;
    await supabase.from("agent_messages").delete().eq("conversation_id", convoId);
    setMessages([]);
  };

  // realtime files
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`project_files:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_files",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setFiles((prev) => {
            if (payload.eventType === "INSERT")
              return [...prev, payload.new as ProjectFile].sort((a, b) =>
                a.path.localeCompare(b.path),
              );
            if (payload.eventType === "UPDATE")
              return prev.map((f) =>
                f.id === (payload.new as any).id ? (payload.new as ProjectFile) : f,
              );
            if (payload.eventType === "DELETE")
              return prev.filter((f) => f.id !== (payload.old as any).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, projectId]);

  // realtime AI chat for the current user's private conversation
  useEffect(() => {
    if (!convoId) return;
    const ch = supabase
      .channel(`agent_messages:${convoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_messages",
          filter: `conversation_id=eq.${convoId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (payload.eventType === "INSERT") {
              const m = payload.new as any;
              if (prev.some((x) => x.id === m.id)) return prev;
              return [...prev, { id: m.id, role: m.role, content: m.content }];
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((x) => x.id !== (payload.old as any).id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [convoId]);

  const active = files.find((f) => f.id === activeId) ?? null;

  useEffect(() => {
    setDraft(active?.content ?? "");
  }, [activeId]); // eslint-disable-line

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-sync edits to Roblox Studio: whenever the user types in the
  // editor, debounce-save to project_files AND queue an update_script
  // action so the same change shows up in their open Studio place
  // within ~1 second. Skips when nothing is open or the draft already
  // matches what's on disk.
  useEffect(() => {
    if (!active) return;
    if ((active.content ?? "") === draft) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("project_files")
        .update({ content: draft, updated_at: new Date().toISOString() })
        .eq("id", active.id);
      if (error) return;
      void tryQueueStudio("update_script", { path: active.path, source: draft });
    }, 900);
    return () => clearTimeout(t);
  }, [draft, active?.id]); // eslint-disable-line

  // Best-effort: try to queue a Studio action without blocking the UI.
  // Studio plugin will no-op if it's offline; if the action isn't allowed yet, we just toast.
  const tryQueueStudio = async (actionType: string, payload: any) => {
    try {
      await runQueuePluginAction({ data: { projectId, actionType, payload } });
      return true;
    } catch (err) {
      console.warn("[studio-sync] queue failed", actionType, err);
      return false;
    }
  };

  const saveFile = async () => {
    if (!active) return;
    const { error } = await supabase
      .from("project_files")
      .update({ content: draft, updated_at: new Date().toISOString() })
      .eq("id", active.id);
    if (error) return toast.error(error.message);
    // Mirror change into Studio so the workspace file edit reflects live.
    void tryQueueStudio("update_script", { path: active.path, source: draft });
    toast.success("Saved — syncing to Studio");
  };

  const deleteFile = async (id: string) => {
    const target = files.find((f) => f.id === id);
    const label = target?.path ?? "this item";
    if (!confirm(`Delete ${label}? It will also be removed from Roblox Studio.`)) return;
    await supabase.from("project_files").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    if (target) {
      // Generic plugin "delete" action — works for scripts AND any other
      // Instance path (Parts, Folders, Lights, GUI objects, etc.) so the
      // Studio workspace stays in sync with what the user removed on the site.
      void tryQueueStudio("delete", { path: target.path });
      // Also queue the script-specific variant in case the live tree row
      // is a Script that lives in a path the generic delete cannot resolve.
      void tryQueueStudio("delete_script", { path: target.path });
      toast.success("Deleted — syncing to Studio");
    }
  };

  const newFile = async () => {
    const path =
      prompt?.trim() || window.prompt("New file path (e.g. ServerScriptService/MyScript)") || "";
    if (!path) return;
    const service = path.split("/")[0] || "ServerScriptService";
    const name = path.split("/").slice(-1)[0] || "Script";
    const parentPath = path.split("/").slice(0, -1).join("/") || service;
    const content = "-- new file\n";
    const { data, error } = await supabase
      .from("project_files")
      .insert({
        project_id: projectId,
        path,
        file_type: "Script",
        service_location: service,
        content,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) {
      setActiveId(data.id);
      // Create the script in Studio too so the workspace stays in sync.
      void tryQueueStudio("script", {
        parent: parentPath,
        name,
        className: "Script",
        source: content,
      });
    }
  };

  const pushToStudio = async () => {
    if (!active) return;
    await saveFile();
    try {
      await runQueuePluginAction({
        data: {
          projectId,
          actionType: "update_script",
          payload: {
            path: active.path,
            source: draft,
          },
        },
      });
      toast.success("Queued script update for the Studio plugin.");
    } catch (err: any) {
      toast.error(
        "I could not queue this for Studio because the plugin action permissions are not configured.",
      );
      console.error(err);
    }
  };

  const refreshFilesFromStudio = async () => {
    try {
      setScanRequestedAt(Date.now());
      setScanTimedOut(false);
      await runQueuePluginAction({
        data: {
          projectId,
          actionType: "scan_project",
          payload: {},
        },
      });
      toast.success("Scan request sent to the Studio plugin.");
    } catch (err: any) {
      setScanRequestedAt(null);
      toast.error(
        "I could not queue this for Studio because the plugin action permissions are not configured.",
      );
      console.error(err);
    }
  };

  const cancelScanWait = () => {
    setScanRequestedAt(null);
    setScanTimedOut(false);
    toast.info(
      "Stopped waiting here. Use Cancel Scan inside the Studio plugin if Roblox is still scanning.",
    );
  };

  // Subscribe to realtime plugin context updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`plugin_context:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "plugin_context",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const updatedCtx = payload.new as any;
          setAiContext((prev) => ({
            fileCount: prev?.fileCount ?? 0,
            instanceCount: updatedCtx?.instance_count ?? null,
            updatedAt: updatedCtx?.updated_at ?? null,
          }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, projectId]);

  const isStudioConnected =
    aiContext?.updatedAt != null && Date.now() - new Date(aiContext.updatedAt).getTime() < 40_000;

  useEffect(() => {
    if (!scanRequestedAt) return;
    const contextTime = aiContext?.updatedAt ? new Date(aiContext.updatedAt).getTime() : 0;
    // Only consider the scan complete when the plugin reports back AFTER our request.
    if (contextTime > scanRequestedAt) {
      setScanRequestedAt(null);
      setScanTimedOut(false);
      return;
    }
    // Give the plugin generous time: 60s for it to pick up the action when
    // disconnected, or up to 2 minutes when actively scanning a real project.
    const timeoutMs = isStudioConnected ? 120_000 : 60_000;
    const timeout = window.setTimeout(() => setScanTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timeout);
  }, [scanRequestedAt, aiContext?.updatedAt, isStudioConnected]);

  const scannerState = scanTimedOut
    ? {
        label: "Error",
        detail:
          "Project scan timed out. Retry, reconnect, or cancel the scan in the Studio plugin.",
        tone: "border-rose-500/35 bg-rose-500/10 text-rose-300",
      }
    : scanRequestedAt && !isStudioConnected
      ? {
          label: "Connecting",
          detail: "Waiting for the Studio plugin to pick up the scan request.",
          tone: "border-amber-500/35 bg-amber-500/10 text-amber-300",
        }
      : scanRequestedAt
        ? {
            label: "Scanning",
            detail: "The Studio plugin is scanning your Roblox project.",
            tone: "border-primary/35 bg-primary/10 text-primary-glow",
          }
        : files.length > 0
          ? {
              label: "Loaded",
              detail: `${files.length} object${files.length === 1 ? "" : "s"} loaded from Roblox Studio.`,
              tone: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
            }
          : isStudioConnected
            ? {
                label: "Empty Project",
                detail: "Studio is connected, but no project objects have been loaded yet.",
                tone: "border-border bg-surface/50 text-muted-foreground",
              }
            : {
                label: "Not Connected",
                detail:
                  "Roblox Studio is not connected. Open the Bloxsmith AI plugin in Studio and press Sync Project.",
                tone: "border-border bg-surface/50 text-muted-foreground",
              };

  const filteredFiles = treeQuery.trim()
    ? files.filter((file) => {
        const q = treeQuery.trim().toLowerCase();
        return [file.path, file.file_type, file.service_location, file.content]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(q));
      })
    : files;
  const activeStudioPath = active ? `game.${active.path.replace(/\//g, ".")}` : "";

  const pushMsg = async (role: "user" | "assistant", content: string, actions?: any) => {
    const tempId = crypto.randomUUID();
    setMessages((m) => [...m, { id: tempId, role, content }]);
    const realId = await persistMsg(role, content, actions);
    if (realId) {
      setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: realId } : x)));
    }
  };

  const runGenerate = async (
    userPrompt: string,
    opts?: { skipUserBubble?: boolean; images?: string[] },
  ) => {
    if (aiBusy) return;
    if (outOfCredits) {
      toast.error("Out of credits. Buy more or wait for the daily refill.");
      return;
    }
    setAiBusy(true);
    stopRequested.current = false;
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const imgs = opts?.images ?? [];
    if (!opts?.skipUserBubble) {
      const bubble = imgs.length
        ? `${userPrompt}\n\n_📎 attached ${imgs.length} image${imgs.length === 1 ? "" : "s"}_`
        : userPrompt;
      await pushMsg("user", bubble);
    }
    try {
      // Call the REAL AI generation server function (Claude Sonnet via the
      // gateway, with tools, clothing, validation, and the error-feedback
      // loop). Previously this hit /api/assistant/execute, a stub that always
      // returned a canned 6-operation "starter" and never invoked the model —
      // which is why every big build came back thin.
      const out = (await runAI({
        data: {
          projectId,
          prompt: userPrompt,
          mode: "generate",
          preview: true,
          thinking,
          ...(imgs.length && /^data:image\//.test(imgs[0]) ? { imageDataUrl: imgs[0] } : {}),
        },
      })) as {
        message: string;
        files?: any[];
        actions?: any[];
        validation?: { errors?: any[]; warnings?: any[]; summary?: string };
        queuedCount?: number;
        generationId?: string | null;
        status?: string;
        dangers?: string[];
        aiActivity?: any[];
      };

      if (stopRequested.current) {
        await pushMsg("assistant", "Stopped the request before it finished.");
        return;
      }

      const v = out.validation;
      const vLine = v
        ? `\n\nSync check: ${v.errors?.length ?? 0} blocked · ${v.warnings?.length ?? 0} warning(s).` +
          (v.errors?.length
            ? "\n" +
              v.errors
                .slice(0, 5)
                .map((e: any) => `  ✗ ${e.target} — ${e.message}`)
                .join("\n")
            : "") +
          (v.warnings?.length
            ? "\n" +
              v.warnings
                .slice(0, 3)
                .map((w: any) => `  ⚠ ${w.target} — ${w.message}`)
                .join("\n")
            : "")
        : "";
      const askLine =
        (out.queuedCount ?? 0) > 0 && out.status !== "executing"
          ? `\n\nReview the ${out.queuedCount} operation${out.queuedCount === 1 ? "" : "s"} below — push to Studio when ready.`
          : "";
      const dangerLine = out.dangers?.length
        ? `\n\nNeeds review before auto-build:\n${out.dangers
            .slice(0, 4)
            .map((d: string) => `  - ${d}`)
            .join("\n")}`
        : "";
      const tempId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: tempId, role: "assistant", content: out.message + vLine + dangerLine + askLine },
      ]);
      // Snapshot pre-state of every file the AI is about to touch, so the user
      // can hit "Revert" to undo this batch (restore old content / delete new
      // files / queue plugin deletes in Studio).
      const snapshot = (out.files ?? []).map((f: any) => {
        const cur = files.find((x) => x.path === f.path);
        return cur
          ? {
              path: f.path,
              content: cur.content,
              file_type: cur.file_type,
              service_location: cur.service_location,
              existed: true,
            }
          : { path: f.path, existed: false };
      });
      const actionsMeta = {
        files: out.files?.length ?? 0,
        actions: out.actions?.length ?? 0,
        validation: v,
        generationId: out.generationId,
        dangers: out.dangers ?? [],
        snapshot,
      };
      const realId = await persistMsg(
        "assistant",
        out.message + vLine + dangerLine + askLine,
        actionsMeta,
      );
      const finalId = realId ?? tempId;
      setMessages((m) =>
        m.map((x) => (x.id === tempId ? { ...x, id: finalId, actions: actionsMeta } : x)),
      );

      // Always surface what the AI built so the user can see files + actions,
      // even when Auto Execute is on.
      if (out.generationId && (out.queuedCount ?? 0) > 0) {
        setPreviewsByMsg((p) => ({
          ...p,
          [finalId]: {
            generationId: out.generationId as string,
            files: out.files ?? [],
            actions: out.actions ?? [],
          },
        }));
      }
      if (out.aiActivity?.length) {
        setActivityByMsg((p) => ({
          ...p,
          [finalId]: out.aiActivity as { tool: string; summary: string; ok: boolean }[],
        }));
      }

      if (out.status === "executing" && out.generationId) {
        setActionStatuses((prev) => ({
          ...prev,
          [finalId]: { status: "executing" },
        }));
        pollGenerationStatus(out.generationId, finalId);
      }

      if (v?.errors?.length || v?.warnings?.length) {
        setValidationByMsg((p) => ({
          ...p,
          [finalId]: {
            errors: v.errors ?? [],
            warnings: v.warnings ?? [],
            originalPrompt: userPrompt,
          },
        }));
      }
    } catch (e: any) {
      if (stopRequested.current || e?.name === "AbortError") {
        await pushMsg("assistant", "Stopped the request before it finished.");
        return;
      }
      const msg = String(e?.message ?? "Failed");
      let friendly = /insufficient credits|Not enough credits/i.test(msg)
        ? "Out of credits. Buy more on the Pricing page or wait for the daily refill at midnight UTC."
        : msg;
      // Surface the real cause. A generation failure is almost always an AI
      // problem (missing GROQ_API_KEY, model error, bad JSON), NOT a Studio
      // plugin issue — so don't blame the plugin connection.
      if (
        friendly.includes("Failed to call a function") ||
        friendly.includes("generation failed") ||
        friendly.includes("AI returned") ||
        friendly.includes("Autopilot failed")
      ) {
        friendly =
          "The AI build request failed on the server" +
          (msg && msg !== "Failed" ? `: ${msg}` : ".") +
          "\n\nThis is a generation error, not a Studio connection problem. " +
          "If it keeps happening, check the server logs and that the AI provider key is set.";
      }
      toast.error(friendly);
      await pushMsg("assistant", friendly);
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setAiBusy(false);
      refreshCredits();
      refreshAiContext();
    }
  };

  const runPlanRequest = async (userPrompt: string) => {
    if (aiBusy) return;
    if (credits !== null && credits < PLAN_COST) {
      toast.error("Not enough credits for a plan.");
      return;
    }
    setAiBusy(true);
    await pushMsg("user", `📋 Plan: ${userPrompt}`);
    try {
      const out: any = await runPlan({ data: { projectId, prompt: userPrompt, thinking } });
      const body = `Here's the build plan (no files written yet):\n\n${out.plan}\n\nReview it, then click "Build this plan" to execute, or refine your request.`;
      const tempId = crypto.randomUUID();
      setMessages((m) => [...m, { id: tempId, role: "assistant", content: body }]);
      const realId = await persistMsg("assistant", body, {
        kind: "plan",
        originalPrompt: out.originalPrompt,
      });
      const finalId = realId ?? tempId;
      if (realId) setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: realId } : x)));
      setPlansByMsg((p) => ({ ...p, [finalId]: { prompt: out.originalPrompt, plan: out.plan } }));
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed");
      toast.error(msg);
      await pushMsg("assistant", "Plan error: " + msg);
    } finally {
      setAiBusy(false);
      refreshCredits();
      refreshAiContext();
    }
  };

  const runChatRequest = async (userPrompt: string, images: string[] = []) => {
    if (aiBusy) return;
    if (credits !== null && credits < CHAT_COST) {
      toast.error("Not enough credits for chat.");
      return;
    }
    setAiBusy(true);
    const bubble = images.length
      ? `${userPrompt}\n\n_📎 attached ${images.length} image${images.length === 1 ? "" : "s"}_`
      : userPrompt;
    await pushMsg("user", bubble);
    const tempAssistantId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: tempAssistantId, role: "assistant", content: "_Thinking..._" },
    ]);
    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const out: any = await runChat({
        data: {
          projectId,
          prompt: userPrompt,
          history,
          thinking,
          ...(images.length ? { attachments: images } : {}),
        },
      });
      const realId = await persistMsg("assistant", out.reply, { kind: "chat" });
      setMessages((m) =>
        m.map((x) =>
          x.id === tempAssistantId
            ? { ...x, id: realId ?? tempAssistantId, content: out.reply, actions: { kind: "chat" } }
            : x,
        ),
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed");
      const friendly = /rate.?limit|busy|too many requests/i.test(msg)
        ? "The AI is busy right now. Give it a moment and try again."
        : /too much context|context|token/i.test(msg)
          ? "That chat has too much context to send at once. Start a fresh thread or paste a shorter chunk."
          : /took too long|timeout|timed out/i.test(msg)
            ? "The chat request took too long. Try a shorter prompt or turn off Thinking mode."
            : msg;
      toast.error(friendly);
      const realId = await persistMsg("assistant", friendly, { kind: "chat_error" });
      setMessages((m) =>
        m.map((x) =>
          x.id === tempAssistantId
            ? {
                ...x,
                id: realId ?? tempAssistantId,
                content: friendly,
                actions: { kind: "chat_error" },
              }
            : x,
        ),
      );
    } finally {
      setAiBusy(false);
      refreshCredits();
    }
  };

  const send = async () => {
    if ((!prompt.trim() && attachments.length === 0) || aiBusy) return;
    const p = prompt;
    const imgs = attachments;
    setPrompt("");
    setAttachments([]);
    // Web-search hint: when the toggle is on, push the AI to actively call
    // the web_search / fetch_url tools to ground its answer.
    const webHint = webSearch
      ? "\n\n[WEB SEARCH ENABLED] You MUST call the web_search tool (and fetch_url for promising results) before answering or building. Cite at least one source URL in your reply."
      : "";
    const composedPrompt = (p || "Analyze the attached image(s) and help.") + webHint;
    if (chatMode) await runChatRequest(composedPrompt, imgs);
    else if (planMode) await runPlanRequest(composedPrompt);
    else await runGenerate(composedPrompt, { images: imgs });
  };

  const buildFromPlan = async (msgId: string) => {
    const entry = plansByMsg[msgId];
    if (!entry) return;
    const composed = `${entry.prompt}\n\nFollow this approved plan exactly:\n${entry.plan}`;
    await pushMsg("user", `🔨 Build the plan above.`);
    setPlansByMsg((p) => {
      const n = { ...p };
      delete n[msgId];
      return n;
    });
    await runGenerate(composed, { skipUserBubble: true });
  };

  const autoFixValidation = async (
    msgId: string,
    opts?: {
      issues?: Array<{ level: "error" | "warning"; target: string; message: string }>;
      label?: string;
    },
  ) => {
    const entry = validationByMsg[msgId];
    if (!entry || aiBusy) return;
    if (outOfCredits) {
      toast.error("Out of credits.");
      return;
    }
    const subsetErrors = opts?.issues?.filter((i) => i.level === "error") ?? entry.errors;
    const subsetWarnings = opts?.issues?.filter((i) => i.level === "warning") ?? entry.warnings;
    const errorList = subsetErrors.length
      ? subsetErrors
          .map((e: any) => `  ✗ ${e.target ?? "(unknown)"} — ${e.message ?? ""}`)
          .join("\n")
      : "(none)";
    const warnList = subsetWarnings?.length
      ? "\n\nWarnings to also address:\n" +
        subsetWarnings
          .slice(0, 10)
          .map((w: any) => `  ⚠ ${w.target ?? ""} — ${w.message ?? ""}`)
          .join("\n")
      : "";
    const composed =
      `The previous attempt for this request had sync-check issues. ` +
      `Original request:\n"${entry.originalPrompt}"\n\n` +
      `Regenerate ONLY what's needed to resolve the items below. Do not re-emit anything that already succeeded. ` +
      `Fix the exact paths/targets named:\nBlocked:\n${errorList}${warnList}\n\n` +
      `Ensure every referenced parent/service exists, paths are valid Roblox service paths, class names are correct, and Luau is syntactically valid.`;
    setAutoFixingMsg(msgId);
    // Remove the targeted issues from the stored validation entry so the drawer updates.
    setValidationByMsg((p) => {
      const cur = p[msgId];
      if (!cur) return p;
      const targets = new Set(
        (opts?.issues ?? [...cur.errors, ...cur.warnings]).map(
          (i) => `${i.level}::${i.target}::${i.message}`,
        ),
      );
      const remainingErr = cur.errors.filter(
        (e: any) => !targets.has(`error::${e.target}::${e.message}`),
      );
      const remainingWarn = cur.warnings.filter(
        (w: any) => !targets.has(`warning::${w.target}::${w.message}`),
      );
      if (remainingErr.length === 0 && remainingWarn.length === 0) {
        const n = { ...p };
        delete n[msgId];
        return n;
      }
      return { ...p, [msgId]: { ...cur, errors: remainingErr, warnings: remainingWarn } };
    });
    const label =
      opts?.label ??
      `${subsetErrors.length} blocked${subsetWarnings.length ? ` + ${subsetWarnings.length} warning(s)` : ""}`;
    await pushMsg("user", `🛠 Auto-fix: ${label}`);
    try {
      await runGenerate(composed, { skipUserBubble: true });
    } finally {
      setAutoFixingMsg(null);
    }
  };

  const doFix = async () => {
    if (!fixLogs.trim() || fixBusy) return;
    if (credits !== null && credits < FIX_COST && !outOfCredits) {
      toast.error("Not enough credits.");
      return;
    }
    if (outOfCredits) {
      toast.error("Out of credits. Buy more or wait for the daily refill.");
      return;
    }
    setFixBusy(true);
    await pushMsg(
      "user",
      `🐛 Fix these errors:\n\n${fixLogs.slice(0, 600)}${fixLogs.length > 600 ? "…" : ""}`,
    );
    try {
      const out = await runFixErrors({ data: { projectId, logs: fixLogs } });
      const v = (out as any).validation;
      const vLine =
        v && (v.errors?.length || v.warnings?.length)
          ? `\n\nSync check: ${v.errors?.length ?? 0} blocked · ${v.warnings?.length ?? 0} warning(s).`
          : "";
      const summary = `${out.message}\n\n${out.errors_found ? `Found ${out.errors_found} error(s). ` : ""}Queued ${out.files.length} script patch${out.files.length === 1 ? "" : "es"} for the Studio plugin. BloxSmith will only show this as applied after the plugin reports success.${vLine}`;
      await pushMsg("assistant", summary, {
        kind: "fix",
        patched: out.files.length,
        validation: v,
      });
      setFixLogs("");
      setShowFix(false);
      toast.success(
        `Queued ${out.files.length} patch${out.files.length === 1 ? "" : "es"}${v?.errors?.length ? ` · ${v.errors.length} blocked by sync check` : ""}`,
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed");
      toast.error(msg);
      await pushMsg("assistant", "Fix error: " + msg);
    } finally {
      setFixBusy(false);
      refreshCredits();
      refreshAiContext();
    }
  };

  const doAutopilot = async () => {
    if (!autoDesc.trim() || autoBusy) return;
    if (credits !== null && credits < AUTOPILOT_COST) {
      toast.error(`Autopilot needs ${AUTOPILOT_COST} credits.`);
      return;
    }
    setAutoBusy(true);
    await pushMsg("user", `🚀 Autopilot:\n\n${autoDesc}`);
    try {
      const out = await runAutopilot({ data: { projectId, description: autoDesc } });
      const phaseList = out.phases
        .map(
          (p, i) =>
            `  ${i + 1}. ${p.title} — ${p.fileCount} file${p.fileCount !== 1 ? "s" : ""}, ${p.actionCount} action${p.actionCount !== 1 ? "s" : ""}`,
        )
        .join("\n");
      const assumptions = out.assumptions?.length
        ? `\n\nAssumptions:\n${out.assumptions.map((a) => `  • ${a}`).join("\n")}`
        : "";
      const v = (out as any).validation;
      const vLine = v
        ? `\n\nSync check: ${v.errors ?? 0} blocked · ${v.warnings ?? 0} warning(s) across ${v.phases?.length ?? 0} phase(s).` +
          (v.phases ?? [])
            .filter((p: any) => p.errors?.length || p.warnings?.length)
            .slice(0, 4)
            .map(
              (p: any) =>
                `\n  ${p.title}:` +
                (p.errors?.length
                  ? "\n" +
                    p.errors
                      .slice(0, 3)
                      .map((e: any) => `    ✗ ${e.target} — ${e.message}`)
                      .join("\n")
                  : "") +
                (p.warnings?.length
                  ? "\n" +
                    p.warnings
                      .slice(0, 2)
                      .map((w: any) => `    ⚠ ${w.target} — ${w.message}`)
                      .join("\n")
                  : ""),
            )
            .join("")
        : "";
      const summary = `${out.summary}\n\nBuild plan:\n${phaseList}${assumptions}\n\nQueued ${out.totalActions} actions covering ${out.totalFiles} files. Waiting for the Studio plugin to confirm each action before calling it applied.${vLine}`;
      await pushMsg("assistant", summary, {
        kind: "autopilot",
        phases: out.phases?.length,
        totalActions: out.totalActions,
        validation: v,
      });
      setAutoDesc("");
      setShowAuto(false);
      toast.success(
        `Autopilot queued ${out.totalActions} actions${v?.errors ? ` · ${v.errors} blocked by sync check` : ""}`,
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed");
      toast.error(msg);
      await pushMsg("assistant", "Autopilot error: " + msg);
    } finally {
      setAutoBusy(false);
      refreshCredits();
      refreshAiContext();
    }
  };

  if (loading || !project)
    return <div className="h-screen grid place-items-center text-muted-foreground">Loading...</div>;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <SyncValidationDrawer
        open={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        messages={messages}
        validationByMsg={validationByMsg}
        onFix={(msgId, opts) => autoFixValidation(msgId, opts)}
        autoFixingMsg={autoFixingMsg}
        busy={aiBusy}
        outOfCredits={outOfCredits}
        fixCost={GENERATE_COST}
      />
      <div className="shrink-0 border-b border-border bg-surface/40">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-semibold truncate text-sm sm:text-base">{project.name}</h1>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {project.game_type}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <PluginStatus />
            <button
              onClick={() => {
                if (!files.length) return toast.error("No files yet — generate some first");
                downloadRbxmx(project.name, files);
                toast.success("Downloaded! Drag the .rbxmx into Roblox Studio");
              }}
              className="rounded-lg border border-border px-2 sm:px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:bg-surface"
              title="Download .rbxmx to drag into Roblox Studio"
              aria-label="Download"
            >
              <Download className="h-3.5 w-3.5" />{" "}
              <span className="hidden sm:inline">Download</span>
            </button>
            <PublishToRobloxButton
              projectId={project.id}
              initialUniverseId={(project as any).roblox_universe_id ?? null}
              initialPlaceId={(project as any).roblox_place_id ?? null}
              lastPublishedAt={(project as any).roblox_last_published_at ?? null}
              lastVersion={(project as any).roblox_last_version ?? null}
              disabled={!files.length}
            />
            <ShowcasePublishButton
              projectId={project.id}
              isPublished={!!(project as any).showcase_published}
              showcaseTitle={(project as any).showcase_title}
              showcaseDescription={(project as any).showcase_description}
              showcaseThumbnailUrl={(project as any).showcase_thumbnail_url}
              projectName={project.name}
            />
            <Link
              to="/plugin"
              className="rounded-lg bg-primary px-2 sm:px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Sync<span className="hidden sm:inline"> to Studio</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile panel switcher */}
      <div className="shrink-0 lg:hidden border-b border-border bg-surface/30 sticky top-[57px] z-30">
        <div className="mx-auto max-w-7xl px-3 grid grid-cols-3 text-xs">
          {(
            [
              { id: "files", label: "Files", icon: Folder },
              { id: "editor", label: "Editor", icon: FileCode },
              { id: "chat", label: "AI Chat", icon: MessageSquare },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setMobileTab(t.id)}
              className={`flex items-center justify-center gap-1.5 py-2.5 border-b-2 transition ${mobileTab === t.id ? "border-primary text-primary-glow" : "border-transparent text-muted-foreground"}`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <main
        className="flex-1 min-h-0 overflow-hidden grid gap-0 relative lg:[grid-template-columns:var(--files-w)_minmax(0,1fr)_var(--chat-col-w)]"
        style={{
          ["--chat-w" as any]: `${chatWidth}px`,
          ["--files-w" as any]: showFiles ? "240px" : "0px",
          ["--chat-col-w" as any]: showChat ? `${chatWidth}px` : "0px",
        }}
      >
        {/* Floating toggles for collapsed side panels (desktop only) */}
        {!showFiles && (
          <button
            onClick={() => toggleFiles(true)}
            title="Show file panel"
            className="hidden lg:flex absolute left-2 top-2 z-30 h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/80 backdrop-blur text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
        {!showChat && (
          <button
            onClick={() => toggleChat(true)}
            title="Show AI chat"
            className="hidden lg:flex absolute right-2 top-2 z-30 h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/80 backdrop-blur text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        )}
        {/* File tree */}
        <aside
          className={`${mobileTab === "files" ? "flex" : "hidden"} ${showFiles ? "lg:flex" : "lg:hidden"} min-h-0 h-full border-r border-border bg-surface/20 overflow-hidden flex-col`}
        >
          <div className="p-3 space-y-3 border-b border-border/40 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Roblox Project
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={refreshFilesFromStudio}
                  className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-surface transition cursor-pointer"
                  title="Refresh Project from Roblox Studio"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${scanRequestedAt ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={newFile}
                  className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-surface transition cursor-pointer"
                  title="New script file"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => toggleFiles(false)}
                  className="hidden lg:inline-flex text-muted-foreground hover:text-foreground p-1 rounded hover:bg-surface transition cursor-pointer"
                  title="Hide file panel"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className={`rounded-lg border px-2.5 py-2 ${scannerState.tone}`}>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {scannerState.label === "Error" ? (
                  <AlertCircle className="h-3.5 w-3.5" />
                ) : scannerState.label === "Scanning" || scannerState.label === "Connecting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : scannerState.label === "Loaded" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
                {scannerState.label}
              </div>
              <p className="mt-1 text-[11px] leading-snug opacity-85">{scannerState.detail}</p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={treeQuery}
                onChange={(e) => setTreeQuery(e.target.value)}
                placeholder="Search paths, classes, code"
                className="w-full rounded-lg border border-border bg-background/45 pl-8 pr-3 py-2 text-xs outline-none focus:border-primary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={refreshFilesFromStudio}
                className="rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs font-medium hover:bg-surface-elevated"
              >
                Refresh Project
              </button>
              <button
                onClick={scanRequestedAt && !scanTimedOut ? cancelScanWait : refreshFilesFromStudio}
                className="rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs font-medium hover:bg-surface-elevated"
              >
                {scanRequestedAt && !scanTimedOut
                  ? "Cancel Wait"
                  : scanTimedOut
                    ? "Retry"
                    : "Rescan"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {filteredFiles.length > 0 ? (
              <div className="space-y-1">
                {Object.values(buildFileTree(filteredFiles).children)
                  .sort((a, b) => {
                    const aHas = Object.keys(a.children).length > 0;
                    const bHas = Object.keys(b.children).length > 0;
                    if (aHas !== bHas) return aHas ? -1 : 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((child) => (
                    <FileTreeItem
                      key={child.path}
                      node={child}
                      activeId={activeId}
                      setActiveId={setActiveId}
                      deleteFile={deleteFile}
                      depth={0}
                    />
                  ))}
              </div>
            ) : files.length > 0 ? (
              <div className="px-4 py-8 flex flex-col items-center justify-center text-center gap-2">
                <Search className="h-5 w-5 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  No matching Roblox objects.
                </span>
              </div>
            ) : isStudioConnected ? (
              <div className="px-4 py-8 flex flex-col items-center justify-center text-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  {scanTimedOut
                    ? "Project scan timed out. Press Retry."
                    : "Scanning Roblox Studio project..."}
                </span>
              </div>
            ) : (
              <div className="px-4 py-8 flex flex-col items-center justify-center text-center gap-2">
                <Plug className="h-5 w-5 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Roblox Studio is not connected. Open the Bloxsmith AI plugin in Studio and press
                  Sync Project.
                </span>
                <Link
                  to="/plugin"
                  className="mt-2 text-xs font-semibold text-primary hover:text-primary-glow hover:underline"
                >
                  Setup Plugin
                </Link>
              </div>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section
          className={`${mobileTab === "editor" ? "flex" : "hidden"} lg:flex flex-col min-h-0 h-full flex-1 min-w-0 bg-background/20 overflow-hidden`}
        >
          {active ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-surface/30">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="h-4 w-4 text-primary-glow shrink-0" />
                  <span className="text-xs font-mono font-medium truncate text-foreground/90">
                    {active.path}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 px-1.5 py-0.5 rounded bg-surface border border-border/40 shrink-0">
                    {active.file_type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveFile}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-surface-elevated transition cursor-pointer"
                  >
                    <Save className="h-3 w-3" /> Save Draft
                  </button>
                  <button
                    onClick={pushToStudio}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-glow transition shadow-lg shadow-primary/20 cursor-pointer"
                  >
                    <Zap className="h-3 w-3" /> Push to Studio
                  </button>
                </div>
              </div>

              <div className="grid gap-2 border-b border-border/50 bg-background/35 px-4 py-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                <div className="min-w-0">
                  <div className="uppercase tracking-wide text-muted-foreground/60">
                    Full Object Path
                  </div>
                  <div className="truncate font-mono text-foreground/80">{activeStudioPath}</div>
                </div>
                <div className="min-w-0">
                  <div className="uppercase tracking-wide text-muted-foreground/60">Class Name</div>
                  <div className="truncate font-mono text-foreground/80">{active.file_type}</div>
                </div>
                <div className="min-w-0">
                  <div className="uppercase tracking-wide text-muted-foreground/60">
                    Roblox Service
                  </div>
                  <div className="truncate font-mono text-foreground/80">
                    {active.service_location || active.path.split("/")[0]}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex min-h-0 relative font-mono text-sm">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-background/40 text-foreground/95 p-4 resize-none focus:outline-none font-mono leading-relaxed border-0 focus:ring-0 selection:bg-primary/30"
                  placeholder="-- Write your Roblox Luau script here..."
                />
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border bg-surface/20 text-xs shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary-glow animate-pulse" />
                  <span className="text-muted-foreground font-medium">Ask BloxSmith AI:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      setPrompt(
                        `Explain this script: ${active.path}\n\nHere is the current code:\n\`\`\`lua\n${draft}\n\`\`\``,
                      );
                      setMobileTab("chat");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2.5 py-1 hover:bg-surface text-muted-foreground hover:text-foreground transition cursor-pointer"
                  >
                    <Brain className="h-3 w-3" /> Explain Script
                  </button>
                  <button
                    onClick={() => {
                      setPrompt(
                        `Fix errors in this script: ${active.path}\n\nHere is the current code:\n\`\`\`lua\n${draft}\n\`\`\``,
                      );
                      setMobileTab("chat");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2.5 py-1 hover:bg-surface text-muted-foreground hover:text-foreground transition cursor-pointer"
                  >
                    <Bug className="h-3 w-3" /> Fix Script
                  </button>
                  <button
                    onClick={() => {
                      setPrompt(
                        `Improve this script and optimize it: ${active.path}\n\nHere is the current code:\n\`\`\`lua\n${draft}\n\`\`\``,
                      );
                      setMobileTab("chat");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2.5 py-1 hover:bg-surface text-muted-foreground hover:text-foreground transition cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" /> Improve Script
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <Code2 className="h-8 w-8 opacity-40 text-primary-glow" />
              <span>Select or create a script file to begin editing.</span>
            </div>
          )}
        </section>

        {/* AI chat */}
        <aside
          className={`${mobileTab === "chat" ? "flex" : "hidden"} ${showChat ? "lg:flex" : "lg:hidden"} relative min-h-0 h-full border-l border-border bg-surface/20 flex-col overflow-hidden`}
        >
          {/* Drag handle to stretch chat panel wider/narrower */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize chat"
            onMouseDown={(e) => {
              e.preventDefault();
              resizing.current = true;
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            onDoubleClick={() => {
              setChatWidth(420);
              localStorage.setItem("bs_chat_width", "420");
            }}
            className="hidden lg:block absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-primary/40 active:bg-primary/60 transition-colors"
          />
          <div className="shrink-0 px-4 py-3 border-b border-border/60 space-y-3">
            <div className="flex items-center justify-between gap-2">
              {(() => {
                const hasLive = aiContext?.updatedAt != null;
                const age = hasLive
                  ? Math.max(
                      0,
                      Math.round((Date.now() - new Date(aiContext!.updatedAt!).getTime()) / 1000),
                    )
                  : null;
                const ageLabel =
                  age == null
                    ? "no live data"
                    : age < 60
                      ? `${age}s ago`
                      : age < 3600
                        ? `${Math.round(age / 60)}m ago`
                        : `${Math.round(age / 3600)}h ago`;
                const tooltip = aiContext
                  ? `AI sees ${aiContext.fileCount} file${aiContext.fileCount === 1 ? "" : "s"}${hasLive ? ` + live Studio (${aiContext.instanceCount ?? "?"} instances · ${ageLabel})` : " — plugin not synced"}`
                  : "Loading…";
                return (
                  <button
                    onClick={refreshAiContext}
                    title={tooltip}
                    className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${hasLive ? "bg-emerald-400" : "bg-amber-400"}`}
                    />
                    <span className="font-medium text-foreground">BloxSmith Executor</span>
                    <span className="text-muted-foreground/70">·</span>
                    <span className="tabular-nums">{credits === null ? "…" : credits} cr</span>
                  </button>
                );
              })()}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setShowAuto(true)}
                  title="Autopilot — describe your game once, BloxSmith builds it"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
                >
                  <Rocket className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowFix(true)}
                  title="Paste Studio output to auto-fix errors"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
                >
                  <Bug className="h-3.5 w-3.5" />
                </button>
                {(() => {
                  const totalErr = Object.values(validationByMsg).reduce(
                    (n, v) => n + v.errors.length,
                    0,
                  );
                  const totalWarn = Object.values(validationByMsg).reduce(
                    (n, v) => n + v.warnings.length,
                    0,
                  );
                  const total = totalErr + totalWarn;
                  return (
                    <button
                      onClick={() => setSyncDrawerOpen(true)}
                      title="Sync validation report"
                      className={`relative h-7 w-7 grid place-items-center rounded-md transition ${
                        totalErr > 0
                          ? "text-destructive hover:bg-destructive/10"
                          : totalWarn > 0
                            ? "text-amber-400 hover:bg-amber-500/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {total > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-1 rounded-full bg-primary text-[9px] font-semibold text-primary-foreground grid place-items-center tabular-nums">
                          {total}
                        </span>
                      )}
                    </button>
                  );
                })()}
                <div className="relative">
                  <button
                    onClick={() => setShowHistory((v) => !v)}
                    title="Chat history"
                    className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
                  >
                    <History className="h-3.5 w-3.5" />
                  </button>
                  {showHistory && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
                      <div className="absolute right-0 top-8 z-50 w-72 max-h-96 overflow-y-auto rounded-lg border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-1">
                        <button
                          onClick={newChat}
                          className="w-full flex items-center gap-2 px-2 py-2 text-xs font-medium rounded-md hover:bg-surface-elevated text-foreground"
                        >
                          <span className="grid h-4 w-4 place-items-center rounded bg-primary/20 text-primary">
                            +
                          </span>
                          New chat
                        </button>
                        <div className="my-1 border-t border-border" />
                        {conversations.length === 0 ? (
                          <p className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                            No history yet
                          </p>
                        ) : (
                          conversations.map((c) => {
                            const active = c.id === convoId;
                            return (
                              <div
                                key={c.id}
                                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"}`}
                              >
                                <button
                                  onClick={() => loadConversation(c.id)}
                                  className="flex-1 min-w-0 text-left truncate"
                                  title={c.title ?? "Chat"}
                                >
                                  {c.title || "New chat"}
                                </button>
                                <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">
                                  {new Date(c.updated_at).toLocaleDateString([], {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                                <button
                                  onClick={() => deleteConversation(c.id)}
                                  title="Delete conversation"
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (messages.length === 0) return;
                    if (confirm("Clear all chat messages? This cannot be undone.")) clearChat();
                  }}
                  disabled={messages.length === 0}
                  title="Clear chat"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowTaskBoard(true)}
                  title="Task Board — Plan → Build → Test → Fix"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary-glow hover:bg-primary/10 transition"
                >
                  <Kanban className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowBuildHistory(true)}
                  title="Build history — every AI batch with files/actions"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary-glow hover:bg-primary/10 transition"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
                <OrganizeProjectButton projectId={projectId} studioConnected={isStudioConnected} />
                <ChatSettings
                  thinking={thinking}
                  onToggleThinking={setThinking}
                  autoExecute={autoExecute}
                  onToggleAutoExecute={toggleAutoExecute}
                  planMode={planMode}
                  onTogglePlanMode={setPlanMode}
                  onClearChat={clearChat}
                  canClearChat={messages.length > 0}
                  studioConnected={isStudioConnected}
                  projectId={projectId}
                />
                <button
                  onClick={() => toggleChat(false)}
                  title="Hide AI chat panel"
                  className="hidden lg:grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition"
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              <button
                onClick={() => setShowAuto(true)}
                className="rounded-lg border border-border bg-background/35 px-2 py-2 text-left hover:bg-surface-elevated transition"
                title="Launch a whole-game build"
              >
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Rocket className="h-3 w-3 text-primary" /> Autopilot
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground">
                  {AUTOPILOT_COST} cr
                </span>
              </button>
              <button
                onClick={() => {
                  setPlanMode((v) => !v);
                  if (chatMode) toggleChatMode(false);
                }}
                className={`rounded-lg border px-2 py-2 text-left transition ${planMode ? "border-primary/50 bg-primary/10" : "border-border bg-background/35 hover:bg-surface-elevated"}`}
                title="Draft a plan before building"
              >
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <ClipboardList className="h-3 w-3 text-primary" /> Plan
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground">
                  {planMode ? "on" : `${PLAN_COST} cr`}
                </span>
              </button>
              <button
                onClick={() => toggleChatMode(!chatMode)}
                className={`rounded-lg border px-2 py-2 text-left transition ${chatMode ? "border-accent/50 bg-accent/10" : "border-border bg-background/35 hover:bg-surface-elevated"}`}
                title="Chat mode — ask questions, get ideas, get code to copy. Nothing is executed in Studio."
              >
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <MessagesSquare className="h-3 w-3 text-accent" /> Chat
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground">
                  {chatMode ? "on" : `${CHAT_COST} cr`}
                </span>
              </button>
              <button
                onClick={() => toggleAutoExecute(!autoExecute)}
                className={`rounded-lg border px-2 py-2 text-left transition ${autoExecute ? "border-success/40 bg-success/10" : "border-border bg-background/35 hover:bg-surface-elevated"}`}
                title="Auto-build safe operations in Studio"
              >
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Zap className="h-3 w-3 text-success" /> Auto
                </span>
                <span className="mt-0.5 block truncate text-muted-foreground">
                  {autoExecute ? "build on" : "preview"}
                </span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4 scroll-smooth">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8 px-2">
                <div className="relative mb-6">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 grid place-items-center border border-primary/20 shadow-[0_0_30px_-5px_oklch(0.72_0.16_155/0.35)]">
                    <Sparkles className="h-8 w-8 text-primary-glow" />
                  </div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-center leading-tight">
                  Tell it what to build.
                  <br />
                  <span className="gradient-text">It will execute.</span>
                </h3>
                <p className="text-sm text-muted-foreground text-center mt-2 max-w-[280px]">
                  Use plain English for worlds, scripts, UI, fixes, assets, and full game systems.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-6 w-full max-w-[320px]">
                  {[
                    {
                      icon: Gamepad2,
                      title: "Build a tycoon",
                      desc: "Make a complete starter tycoon with droppers, cash, buttons, UI, and saves.",
                    },
                    {
                      icon: Code2,
                      title: "Add combat",
                      desc: "Create server-validated sword combat with cooldowns, hit effects, and mobile controls.",
                    },
                    {
                      icon: Zap,
                      title: "Make the map",
                      desc: "Build a bright spawn island with paths, trees, lighting, coins, and a shop stand.",
                    },
                    {
                      icon: Database,
                      title: "Add persistence",
                      desc: "Add DataStore-backed coins, rebirths, inventory, autosave, and BindToClose handling.",
                    },
                    {
                      icon: Shirt,
                      title: "Design clothing",
                      desc: "Make me a black and red cyber hoodie design, plus matching pants, as Roblox-ready clothing.",
                    },
                  ].map((s) => (
                    <button
                      key={s.title}
                      onClick={() => setPrompt(s.desc)}
                      className="group flex flex-col items-start gap-1.5 rounded-xl border border-border/50 bg-surface-elevated/40 p-3 text-left hover:bg-surface-elevated hover:border-primary/30 transition"
                    >
                      <s.icon className="h-4 w-4 text-primary-glow/80 group-hover:text-primary-glow transition" />
                      <span className="text-xs font-semibold text-foreground">{s.title}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">
                        {s.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex gap-2.5 animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="shrink-0 mt-1 h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-primary/40 overflow-hidden">
                      <img
                        src="/logo.png"
                        alt="BloxSmith AI"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div
                    className={`flex flex-col gap-2 max-w-[88%] ${isUser ? "items-end" : "items-start"}`}
                  >
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 px-1">
                      {isUser ? "You" : "BloxSmith AI"}
                    </span>
                    <div
                      className={
                        isUser
                          ? "rounded-2xl rounded-tr-sm bg-primary/90 text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap break-words px-3.5 py-2.5 shadow-md"
                          : "rounded-2xl rounded-tl-sm bg-surface-elevated/80 backdrop-blur-sm border border-border/60 text-foreground px-3.5 py-2.5 shadow-md w-full"
                      }
                    >
                      {isUser ? m.content : <AssistantMessage content={m.content} />}
                    </div>
                    <div className="w-full space-y-2">
                      {!isUser && activityByMsg[m.id]?.length > 0 && (
                        <div className="rounded-lg border border-border/60 bg-surface/40 p-2 space-y-1">
                          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 px-0.5">
                            AI activity · {activityByMsg[m.id].length} tool call
                            {activityByMsg[m.id].length === 1 ? "" : "s"}
                          </div>
                          <ul className="space-y-0.5">
                            {activityByMsg[m.id].slice(0, 12).map((ev, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-1.5 text-[11px] text-foreground/80"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${ev.ok ? "bg-emerald-400" : "bg-amber-400"}`}
                                />
                                <span className="font-mono text-muted-foreground text-[10px]">
                                  {ev.tool}
                                </span>
                                <span className="truncate">{ev.summary}</span>
                              </li>
                            ))}
                            {activityByMsg[m.id].length > 12 && (
                              <li className="text-[10px] italic text-muted-foreground px-3">
                                …and {activityByMsg[m.id].length - 12} more
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {!isUser && previewsByMsg[m.id] && (
                        <PushPreview
                          preview={previewsByMsg[m.id]}
                          readOnly={
                            actionStatuses[m.id]?.status === "executing" ||
                            actionStatuses[m.id]?.status === "complete"
                          }
                          onApplied={() =>
                            setPreviewsByMsg((p) => {
                              const n = { ...p };
                              delete n[m.id];
                              return n;
                            })
                          }
                          onDiscarded={() =>
                            setPreviewsByMsg((p) => {
                              const n = { ...p };
                              delete n[m.id];
                              return n;
                            })
                          }
                        />
                      )}
                      {!isUser && actionStatuses[m.id] && (
                        <div className="space-y-1.5">
                          {/* "executing" and "queued" waiting states are hidden —
                              the Studio plugin polls on its own and applies actions automatically.
                              Only show terminal states (complete/error). */}

                          {actionStatuses[m.id].status === "complete" && (
                            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>Studio plugin confirmed this batch completed.</span>
                            </div>
                          )}
                          {actionStatuses[m.id].status === "error" && (
                            <div className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-xs text-rose-300">
                              <span className="h-3.5 w-3.5 bg-rose-500 text-black rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">
                                !
                              </span>
                              <span className="truncate">
                                Error — execution failed: {actionStatuses[m.id].error}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {!isUser && plansByMsg[m.id] && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => buildFromPlan(m.id)}
                            disabled={aiBusy || outOfCredits}
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                          >
                            <Hammer className="h-3.5 w-3.5" /> Build this plan ({GENERATE_COST} cr)
                          </button>
                          <button
                            onClick={() =>
                              setPlansByMsg((p) => {
                                const n = { ...p };
                                delete n[m.id];
                                return n;
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-elevated transition"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {!isUser && validationByMsg[m.id]?.errors?.length > 0 && (
                        <button
                          onClick={() => autoFixValidation(m.id)}
                          disabled={aiBusy || outOfCredits}
                          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50"
                          title="Send the sync-check errors back to the AI and regenerate only the failing files/actions"
                        >
                          {autoFixingMsg === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bug className="h-3.5 w-3.5" />
                          )}
                          Auto-fix {validationByMsg[m.id].errors.length} blocked ({GENERATE_COST}{" "}
                          cr)
                        </button>
                      )}
                      {!isUser &&
                        m.actions?.snapshot?.length > 0 &&
                        (revertedByMsg[m.id] ? (
                          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Reverted
                          </div>
                        ) : (
                          <button
                            onClick={() => revertMessage(m)}
                            disabled={revertingMsg === m.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-elevated hover:border-rose-400/40 hover:text-rose-300 transition disabled:opacity-50"
                            title={`Undo this AI response — restores ${m.actions.snapshot.length} file${m.actions.snapshot.length === 1 ? "" : "s"} and removes new ones from Studio on next sync.`}
                          >
                            {revertingMsg === m.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Revert this change
                          </button>
                        ))}
                    </div>
                  </div>
                  {isUser && (
                    <div className="shrink-0 mt-1 h-7 w-7 rounded-full bg-surface-elevated border border-border flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
            {aiBusy &&
              (() => {
                const phase = chatMode ? "chat" : planMode ? "plan" : "build";
                const phaseLabel =
                  phase === "chat"
                    ? "Thinking…"
                    : phase === "plan"
                      ? "Planning your build…"
                      : "Crafting your Roblox magic…";
                const steps =
                  phase === "chat"
                    ? ["Reading your message", "Reviewing project context", "Composing a reply"]
                    : phase === "plan"
                      ? [
                          "Analyzing your request",
                          "Inspecting current project tree",
                          "Outlining the build steps",
                          "Finalizing the plan",
                        ]
                      : [
                          "Reading your request",
                          "Loading current project state",
                          "Designing scripts & instances",
                          "Generating files and actions",
                          "Validating against Roblox",
                          "Finalizing the build",
                        ];
                // step roughly every 3.5s for a livelier feel, clamp to last
                const stepIdx = Math.min(steps.length - 1, Math.floor(aiBusyElapsed / 3.5));
                const mm = String(Math.floor(aiBusyElapsed / 60)).padStart(1, "0");
                const ss = String(aiBusyElapsed % 60).padStart(2, "0");
                return (
                  <div className="flex gap-2.5 animate-fade-in">
                    <div className="shrink-0 mt-1 h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-lg shadow-primary/30 ring-1 ring-primary/40 animate-pulse">
                      <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 px-1">
                        BloxSmith AI
                      </span>
                      <button
                        type="button"
                        onClick={() => setAiBusyExpanded((v) => !v)}
                        className="text-left rounded-2xl rounded-tl-sm bg-surface-elevated/80 backdrop-blur-sm border border-primary/20 px-3.5 py-2.5 shadow-md hover:border-primary/40 transition cursor-pointer"
                        title={aiBusyExpanded ? "Hide details" : "Tap to see what the AI is doing"}
                      >
                        <div className="inline-flex items-center gap-2.5">
                          <span className="flex gap-1">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            />
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            />
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            />
                          </span>
                          <span className="text-xs text-foreground/80 font-medium">
                            {phaseLabel}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {mm}:{ss}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70 ml-1">
                            {aiBusyExpanded ? "▾" : "▸"}
                          </span>
                        </div>
                        {aiBusyExpanded && (
                          <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                            {steps.map((s, i) => {
                              const done = i < stepIdx;
                              const active = i === stepIdx;
                              return (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {done ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                  ) : active ? (
                                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                                  ) : (
                                    <span className="h-3.5 w-3.5 rounded-full border border-border shrink-0" />
                                  )}
                                  <span
                                    className={
                                      active
                                        ? "text-foreground"
                                        : done
                                          ? "text-muted-foreground line-through"
                                          : "text-muted-foreground/70"
                                    }
                                  >
                                    {s}
                                  </span>
                                </div>
                              );
                            })}
                            <p className="text-[10px] text-muted-foreground/60 pt-1">
                              Estimated progress — the AI works on these in order.
                            </p>
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            <div ref={chatEnd} />
          </div>

          {outOfCredits && !(chatMode && credits !== null && credits >= CHAT_COST) ? (
            <div className="shrink-0 border-t border-border p-3 space-y-2 bg-destructive/5">
              <p className="text-sm font-semibold text-destructive">You're out of credits</p>
              <p className="text-xs text-muted-foreground">
                Each build costs {GENERATE_COST} credits. Your balance gets +10 free credits daily
                every day at midnight UTC, or buy a pack now to keep building.
              </p>
              <Link
                to="/pricing"
                className="block w-full text-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Buy credits
              </Link>
            </div>
          ) : (
            <div className="shrink-0 border-t border-border p-3 space-y-2">
              <div
                className={`rounded-xl border bg-background/45 p-2 transition ${chatMode ? "border-accent/40" : planMode ? "border-primary/40" : "border-border focus-within:border-primary/40"}`}
              >
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((src, i) => (
                      <div
                        key={i}
                        className="group relative h-14 w-14 overflow-hidden rounded-md border border-border bg-surface"
                      >
                        <img src={src} alt="attachment" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-background/80 text-foreground opacity-0 group-hover:opacity-100 transition"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!prompt.trim() && attachments.length === 0 && !chatMode && !planMode && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {[
                      "Make a sword tool",
                      "Create a main menu",
                      "Add a leaderstats system",
                      "Build a simple shop GUI",
                      "Make a loading screen",
                      "Add a daily reward",
                    ].map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        onClick={() => setPrompt(tpl)}
                        className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition"
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onPaste={(e) => {
                    if (!chatMode) return;
                    const items = Array.from(e.clipboardData?.items ?? []);
                    const imgs = items
                      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                      .map((it) => it.getAsFile())
                      .filter((f): f is File => !!f);
                    if (imgs.length) {
                      e.preventDefault();
                      void addAttachmentFiles(imgs);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={3}
                  placeholder={
                    chatMode
                      ? "Ask anything, or attach a screenshot of your game/Studio — the AI will analyze it."
                      : planMode
                        ? "Describe the Roblox system you want planned..."
                        : "Type any command: build a map, add UI, create scripts, insert assets, fix bugs..."
                  }
                  className="min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length) {
                      void addAttachmentFiles(e.target.files);
                      e.target.value = "";
                    }
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setThinking((v) => !v)}
                      title={thinking ? "Thinking mode on" : "Thinking mode off"}
                      className={`h-8 w-8 grid place-items-center rounded-lg transition ${thinking ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
                    >
                      <Brain className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const current = prompt.trim();
                        if (!current || improving) return;
                        setImproving(true);
                        try {
                          const out = await runImprovePrompt({ data: { prompt: current } });
                          setPrompt(out.prompt);
                          toast.success("Prompt improved");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Couldn't improve prompt");
                        } finally {
                          setImproving(false);
                        }
                      }}
                      disabled={improving || !prompt.trim()}
                      title="Improve prompt"
                      className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition disabled:opacity-40"
                    >
                      {improving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFix(true)}
                      title="Fix Studio errors"
                      className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition"
                    >
                      <Bug className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleMic}
                      title={listening ? "Stop dictation" : "Voice input"}
                      className={`h-8 w-8 grid place-items-center rounded-lg transition ${listening ? "text-rose-300 bg-rose-500/15 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
                    >
                      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title={
                        attachments.length >= MAX_ATTACHMENTS
                          ? `Max ${MAX_ATTACHMENTS} images`
                          : "Attach image for AI to analyze"
                      }
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                      className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2 transition disabled:opacity-40 ${attachments.length > 0 ? "border-primary/40 text-primary bg-primary/10" : "border-primary/30 text-primary/90 hover:bg-primary/10"}`}
                    >
                      <ImagePlus className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebSearch((v) => !v)}
                      title={
                        webSearch
                          ? "Web search ON — AI will research before answering"
                          : "Enable web search (AI will look things up)"
                      }
                      className={`h-8 w-8 grid place-items-center rounded-lg transition ${webSearch ? "text-sky-300 bg-sky-500/15" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
                    >
                      <Globe className="h-4 w-4" />
                    </button>
                  </div>
                  {aiBusy ? (
                    <button
                      onClick={stopGeneration}
                      className="inline-flex h-8 items-center gap-2 rounded-lg bg-rose-500/90 px-3 text-xs font-semibold text-white hover:bg-rose-500 transition"
                      title="Stop generating"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={send}
                      disabled={!prompt.trim() && attachments.length === 0}
                      className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-30"
                      title={
                        chatMode
                          ? `Send chat · ${CHAT_COST} cr`
                          : planMode
                            ? `Generate plan · ${PLAN_COST} cr`
                            : `Build · ${GENERATE_COST} cr`
                      }
                    >
                      <Send className="h-3.5 w-3.5" />
                      {chatMode ? "Chat" : planMode ? "Plan" : autoExecute ? "Execute" : "Preview"}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowAiSourceModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/60 border border-border/40 px-2.5 py-0.5 text-[10px] hover:border-primary/60 transition"
                    title={
                      aiSettings.mode === "api_key"
                        ? `Using your own ${aiSettings.provider ?? ""} API key — click to change`
                        : mcpClient?.lastUsedAt
                          ? `Last connected via ${mcpClient.client ?? "MCP client"} at ${new Date(mcpClient.lastUsedAt).toLocaleString()} — click to change source`
                          : "Click to switch between MCP and your own API key"
                    }
                  >
                    {(() => {
                      const providerNames: Record<string, string> = {
                        openai: "OpenAI",
                        anthropic: "Anthropic",
                        google: "Google",
                        groq: "Groq",
                      };
                      if (aiSettings.mode === "api_key" && aiSettings.provider) {
                        const label = `${providerNames[aiSettings.provider] ?? aiSettings.provider}${aiSettings.model ? ` · ${aiSettings.model}` : ""} · your key`;
                        return (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                            <span className="text-muted-foreground">{label}</span>
                          </>
                        );
                      }
                      const recent = mcpClient?.lastUsedAt
                        ? Date.now() - new Date(mcpClient.lastUsedAt).getTime() < 10 * 60 * 1000
                        : false;
                      const client = mcpClient?.client;
                      let modelLabel = "";
                      if (client) {
                        const c = client.toLowerCase();
                        if (c.includes("codex")) modelLabel = "GPT-5 Codex";
                        else if (c.includes("chatgpt")) modelLabel = "ChatGPT";
                        else if (c.includes("claude code")) modelLabel = "Claude Sonnet";
                        else if (c.includes("claude")) modelLabel = "Claude";
                        else if (c.includes("cursor")) modelLabel = "Cursor AI";
                        else if (c.includes("windsurf")) modelLabel = "Windsurf";
                        else if (c.includes("cline")) modelLabel = "Cline";
                        else if (c.includes("zed")) modelLabel = "Zed AI";
                      }
                      const mcpPart =
                        mcpServers.length === 0
                          ? "MCP: off"
                          : `MCP: ${mcpServers
                              .slice(0, 2)
                              .map((s) => s.name)
                              .join(
                                ", ",
                              )}${mcpServers.length > 2 ? ` +${mcpServers.length - 2}` : ""}`;
                      const label = client
                        ? `${client}${modelLabel ? ` · ${modelLabel}` : ""} · ${mcpPart}`
                        : `Waiting for AI client · ${mcpPart}`;
                      return (
                        <>
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${recent ? "bg-success animate-pulse" : client ? "bg-emerald-500/60" : "bg-amber-400"}`}
                          />
                          <span className="text-muted-foreground">{label}</span>
                        </>
                      );
                    })()}
                  </button>

                  <ModelPicker
                    projectId={projectId}
                    provider={aiSettings.provider === "neokens" ? aiSettings.provider : null}
                    model={aiSettings.model}
                    onChange={(p, m) => setAiSettings({ mode: "api_key", provider: p, model: m })}
                  />

                  {aiUsage &&
                    !aiUsage.owner &&
                    (() => {
                      const pct5 = Math.min(
                        100,
                        Math.round((aiUsage.used_5h / aiUsage.limit_5h) * 100),
                      );
                      const near = pct5 >= 80;
                      const full = pct5 >= 100;
                      return (
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/60 border px-2.5 py-0.5 text-[10px] tabular-nums ${full ? "border-destructive/60" : near ? "border-amber-400/60" : "border-border/40"}`}
                          title={`AI usage: ${aiUsage.used_5h}/${aiUsage.limit_5h} in last 5h · ${aiUsage.used_7d}/${aiUsage.limit_7d} in last 7d${aiUsage.reset_5h ? ` · resets ${new Date(aiUsage.reset_5h).toLocaleTimeString()}` : ""}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${full ? "bg-destructive" : near ? "bg-amber-400" : "bg-emerald-500/70"}`}
                          />
                          <span className="text-muted-foreground">
                            Usage {aiUsage.used_5h}/{aiUsage.limit_5h} · {aiUsage.used_7d}/
                            {aiUsage.limit_7d}
                          </span>
                        </div>
                      );
                    })()}

                  <div
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/60 border border-border/40 px-2.5 py-0.5 text-[10px]"
                    title={
                      isStudioConnected
                        ? "Roblox Studio plugin connected"
                        : "Roblox Studio plugin not connected"
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isStudioConnected ? "bg-success animate-pulse" : "bg-amber-400"}`}
                    />
                    <span className="text-muted-foreground">
                      Studio: {isStudioConnected ? "live" : "waiting"}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {chatMode
                    ? `${CHAT_COST} cr / chat`
                    : planMode
                      ? `${PLAN_COST} cr / plan`
                      : `${GENERATE_COST} cr / build`}
                  {thinking ? " · deeper" : ""}
                </span>
              </div>
            </div>
          )}
        </aside>
      </main>

      {showAiSourceModal && (
        <AiSourceSettings projectId={projectId} onClose={() => setShowAiSourceModal(false)} />
      )}

      {showFix && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => !fixBusy && setShowFix(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Auto-fix Studio errors</h2>
              </div>
              <button
                onClick={() => !fixBusy && setShowFix(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Paste the raw Output / Console from Roblox Studio. BloxSmith will identify the
                failing scripts, prepare patches, and queue them for the Studio plugin.
              </p>
              <textarea
                value={fixLogs}
                onChange={(e) => setFixLogs(e.target.value)}
                spellCheck={false}
                placeholder={`Example:\n14:32:18.221  ServerScriptService.CoinHandler:18: attempt to index nil with "leaderstats"  -  Server\n14:32:18.221  Stack Begin  -  Studio\n...`}
                className="w-full h-72 rounded-lg bg-background border border-border p-3 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Costs {FIX_COST} credits · uses live workspace context
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFix(false)}
                    disabled={fixBusy}
                    className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doFix}
                    disabled={fixBusy || !fixLogs.trim() || outOfCredits}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {fixBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bug className="h-4 w-4" />
                    )}
                    {fixBusy ? "Analyzing & patching…" : "Fix errors"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAuto && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => !autoBusy && setShowAuto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Autopilot — describe your whole game</h2>
              </div>
              <button
                onClick={() => !autoBusy && setShowAuto(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Describe your game in plain English. BloxSmith plans the architecture, then builds
                folders, RemoteEvents, modules, server systems, client controllers, and UI — in
                dependency order — directly into Studio via the plugin.
              </p>
              <textarea
                value={autoDesc}
                onChange={(e) => setAutoDesc(e.target.value)}
                spellCheck={true}
                placeholder={`Example:\nA simulator game where players punch trees to get wood, sell it at a shop for coins, then buy stronger axes from a rebirth system. Include leaderstats, a data store for saves, a coin pickup system, and a basic shop GUI.`}
                className="w-full h-56 rounded-lg bg-background border border-border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {(() => {
                const phases = [
                  { name: "Structure", desc: "Folders, RemoteEvents, RemoteFunctions", weight: 1 },
                  { name: "Shared Modules", desc: "config, types, utilities", weight: 1 },
                  { name: "Server Systems", desc: "data, economy, gameplay scripts", weight: 3 },
                  { name: "Client Controllers", desc: "input, replication", weight: 2 },
                  { name: "UI", desc: "ScreenGuis + LocalScripts", weight: 2 },
                  { name: "World", desc: "Parts, spawn points, lighting", weight: 1 },
                ];
                const totalWeight = phases.reduce((s, p) => s + p.weight, 0);
                const costs = phases.map((p) =>
                  Math.max(1, Math.round((p.weight / totalWeight) * AUTOPILOT_COST)),
                );
                const sum = costs.reduce((a, b) => a + b, 0);
                return (
                  <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">Credit cost per step</span>
                      <span className="text-muted-foreground">
                        Est. total{" "}
                        <span className="font-semibold text-foreground">{sum} credits</span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      {phases.map((p, i) => (
                        <div key={p.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                              {i + 1}
                            </span>
                            <span className="truncate">
                              <span className="text-foreground font-medium">{p.name}</span>{" "}
                              <span className="text-muted-foreground">— {p.desc}</span>
                            </span>
                          </div>
                          <span className="shrink-0 rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] font-semibold text-foreground">
                            {costs[i]} cr
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                      Charged once up-front ({AUTOPILOT_COST} credits). Refunded automatically if
                      the build fails before any files are written.
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Heavier steps (server systems, UI) cost more credits · queued in order
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAuto(false)}
                    disabled={autoBusy}
                    className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={doAutopilot}
                    disabled={
                      autoBusy || !autoDesc.trim() || (credits !== null && credits < AUTOPILOT_COST)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {autoBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    {autoBusy ? "Planning & building…" : "Launch Autopilot"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <BuildHistoryDrawer
        projectId={projectId}
        open={showBuildHistory}
        onClose={() => setShowBuildHistory(false)}
      />
      <TaskBoard
        projectId={projectId}
        open={showTaskBoard}
        onClose={() => setShowTaskBoard(false)}
        onBuildTask={(t, brief) => {
          setPrompt(
            `Build the task: ${t.title}\n\nBrief from project manager:\n${brief}\n\nGenerate the scripts and queue Studio actions to insert them.`,
          );
          toggleChat(true);
        }}
      />
    </div>
  );
}

interface TreeNode {
  name: string;
  path: string;
  file?: ProjectFile;
  children: Record<string, TreeNode>;
}

function buildFileTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: "Root", path: "", children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: {},
        };
      }
      current = current.children[part];
      if (i === parts.length - 1) {
        current.file = f;
      }
    }
  }
  return root;
}

function FileTreeItem({
  node,
  activeId,
  setActiveId,
  deleteFile,
  depth = 0,
}: {
  node: TreeNode;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  deleteFile: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1); // Expand first level by default (e.g. Workspace, ServerScriptService)
  const hasChildren = Object.keys(node.children).length > 0;
  const isScript =
    node.file?.file_type === "Script" ||
    node.file?.file_type === "LocalScript" ||
    node.file?.file_type === "ModuleScript" ||
    node.name.endsWith(".lua");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setExpanded(!expanded);
    }
    if (node.file) {
      setActiveId(node.file.id);
    }
  };

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-surface text-xs rounded transition-colors ${
          node.file && activeId === node.file.id
            ? "bg-primary/20 text-primary-glow font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        onClick={handleClick}
      >
        <span className="flex items-center gap-1.5 truncate">
          {hasChildren ? (
            <span className="text-[9px] w-3 text-muted-foreground/60 transition-transform">
              {expanded ? "▼" : "▶"}
            </span>
          ) : (
            <span className="w-3" />
          )}
          {isScript ? (
            <FileCode className="h-3.5 w-3.5 shrink-0 text-primary-glow" />
          ) : hasChildren ? (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
          ) : (
            <Box className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
          <span className="truncate">{node.name}</span>
        </span>
        {node.file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteFile(node.file!.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {Object.values(node.children)
            .sort((a, b) => {
              const aHas = Object.keys(a.children).length > 0;
              const bHas = Object.keys(b.children).length > 0;
              if (aHas !== bHas) return aHas ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                activeId={activeId}
                setActiveId={setActiveId}
                deleteFile={deleteFile}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </div>
  );
}
