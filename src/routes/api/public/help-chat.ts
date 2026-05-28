import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createProvider } from "@/lib/ai-providers.server";
import { createGroqProvider, BLOXSMITH_FAST_MODEL } from "@/lib/ai-gateway.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const MAX_MESSAGE_CHARS = 1500;

function takeRateLimit(ip: string): { ok: true } | { ok: false; retryMs: number } {
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (existing.count >= MAX_PER_WINDOW) {
    return { ok: false, retryMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { ok: true };
}

function sweepBuckets() {
  if (buckets.size < 5000) return;
  const now = Date.now();
  for (const [ip, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(ip);
  }
}

function ipOf(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon"
  );
}

const HELP_SYSTEM_PROMPT = `You are the BloxSmith Help Bot — a small friendly assistant that lives in a chat bubble on bloxsmith.pro and answers questions about the BloxSmith website and product.

WHAT YOU KNOW ABOUT BLOXSMITH:
BloxSmith is an AI-powered Roblox game builder. Users describe a Roblox game in plain English and BloxSmith generates production-ready Luau scripts, UI, full game systems, Toolbox/free-model insertions, sounds, decals, lighting, maps, and assets — then pushes everything directly into Roblox Studio through a companion plugin.

KEY FACTS:
- Official site: https://bloxsmith.pro
- Independent project — NOT affiliated with Roblox Corporation.
- Pricing: credit-based pay-as-you-go. New users get free starter credits and daily free credits when configured.
- The Roblox Studio plugin syncs generations into the user's place and supports edit-mode insertion, not just Play mode.
- Image upload is supported for project screenshots.
- MCP support lets external AI tools connect to BloxSmith.

PAGES:
/ Home, /pricing Credits, /templates Templates, /ideas Ideas, /plugin Plugin setup, /mcp External AI, /mcp-servers MCP tokens, /docs Guides, /faq Questions, /changelog Updates, /account Account.

HOW TO BEHAVE:
- Friendly, short, helpful. 1–3 sentences usually.
- If someone asks to build a Roblox game or write Luau, redirect them to the main project chat at /dashboard.
- If unsure, point to /faq, /docs, /plugin, or /pricing. Do not guess exact prices or promos.
- Never claim to be Roblox staff or affiliated with Roblox.
- Plain text only. Light markdown is okay.`;

type Message = { role: "user" | "assistant"; content: string };

function sanitizeHistory(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  const out: Message[] = [];
  for (const item of raw.slice(-10)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as any).role;
    const content = (item as any).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    out.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  return out;
}

function pickGateway() {
  const neoKey = process.env.NEOKENS_API_KEY || process.env.NEOKENS_KEY;
  if (neoKey) {
    const gw = createProvider("neokens", neoKey);
    return { gw, modelName: "gemini-3-flash", providerName: "neokens" as const };
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const gw = createGroqProvider(groqKey);
    return { gw, modelName: BLOXSMITH_FAST_MODEL, providerName: "groq" as const };
  }

  return null;
}

function localHelpAnswer(message: string): string {
  const q = message.toLowerCase();

  if (/plugin|install|studio|connect|sync|token/.test(q)) {
    return "To use the plugin: log in, open /plugin, install the Roblox Studio plugin, open your Studio project, connect your token, then use the project chat and Sync to send builds into Studio.";
  }

  if (/credit|price|cost|paypal|pay/.test(q)) {
    return "BloxSmith uses credits for AI builds and plugin actions. Check /pricing for current packs, PayPal options, and any free-credit offers.";
  }

  if (/mcp|claude|cursor|codex|external/.test(q)) {
    return "MCP lets external AI tools connect to BloxSmith. Open /mcp for setup info or /mcp-servers to manage your tokens.";
  }

  if (/what|bloxsmith|do|make|build/.test(q)) {
    return "BloxSmith is an AI Roblox game builder. It can generate scripts, maps, GUIs, systems, assets, VFX, sounds, and then push them into Roblox Studio with the plugin.";
  }

  if (/help|docs|faq|guide/.test(q)) {
    return "For setup help, open /docs or /faq. For building, go to /dashboard, create a project, connect Studio, and ask the main AI chat what you want made.";
  }

  return "I can help with BloxSmith setup, credits, the Roblox Studio plugin, MCP, and how the site works. For building Roblox content, open /dashboard and use the main project chat.";
}

export const Route = createFileRoute("/api/public/help-chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const ip = ipOf(request);
          const limit = takeRateLimit(ip);
          if (!limit.ok) {
            return new Response(
              JSON.stringify({
                error: "rate_limited",
                message: "You're sending messages a little fast — try again in a minute.",
                retryMs: limit.retryMs,
              }),
              { status: 429, headers: cors },
            );
          }
          sweepBuckets();

          const body = await request.json().catch(() => ({}));
          const message = typeof body?.message === "string" ? body.message.trim() : "";
          if (!message) {
            return new Response(JSON.stringify({ error: "missing_message" }), {
              status: 400,
              headers: cors,
            });
          }
          if (message.length > MAX_MESSAGE_CHARS) {
            return new Response(
              JSON.stringify({
                error: "too_long",
                message: `Please keep your question under ${MAX_MESSAGE_CHARS} characters.`,
              }),
              { status: 400, headers: cors },
            );
          }

          const history = sanitizeHistory(body?.history);
          const gateway = pickGateway();

          if (!gateway) {
            console.warn("[help-chat] no model gateway configured; using local fallback answer.");
            return new Response(
              JSON.stringify({ reply: localHelpAnswer(message), model: "local-fallback" }),
              {
                status: 200,
                headers: cors,
              },
            );
          }

          const messages = [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: message },
          ];

          try {
            const { text } = await generateText({
              model: gateway.gw(gateway.modelName),
              system: HELP_SYSTEM_PROMPT,
              messages,
              maxOutputTokens: 500,
              maxRetries: 1,
              temperature: 0.35,
              abortSignal: AbortSignal.timeout(30_000),
            });
            const reply = (text ?? "").trim() || localHelpAnswer(message);
            return new Response(JSON.stringify({ reply, model: gateway.modelName }), {
              status: 200,
              headers: cors,
            });
          } catch (err: any) {
            console.warn(
              "[help-chat] model call failed; using local fallback:",
              err?.message ?? err,
            );
            return new Response(
              JSON.stringify({ reply: localHelpAnswer(message), model: "local-fallback" }),
              {
                status: 200,
                headers: cors,
              },
            );
          }
        } catch (err: any) {
          console.error("[help-chat] unexpected error:", err?.message ?? err);
          return new Response(
            JSON.stringify({
              reply: "Something went wrong, but you can still check /faq or /docs for setup help.",
            }),
            {
              status: 200,
              headers: cors,
            },
          );
        }
      },
    },
  },
});
