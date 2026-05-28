import { memo, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

type Block = { type: "text"; content: string } | { type: "code"; lang: string; content: string };

function parseMarkdown(input: string): Block[] {
  const blocks: Block[] = [];
  const re = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m.index > last) {
      const text = input.slice(last, m.index);
      if (text.trim()) blocks.push({ type: "text", content: text });
    }
    blocks.push({
      type: "code",
      lang: (m[1] || "lua").toLowerCase(),
      content: m[2].replace(/\n$/, ""),
    });
    last = re.lastIndex;
  }
  if (last < input.length) {
    const text = input.slice(last);
    if (text.trim()) blocks.push({ type: "text", content: text });
  }
  if (blocks.length === 0) blocks.push({ type: "text", content: input });
  return blocks;
}

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="group relative my-2 overflow-hidden rounded-lg border border-border bg-background/70">
      <div className="flex items-center justify-between border-b border-border/60 bg-surface/40 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-elevated hover:text-foreground transition"
        >
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono text-foreground/90">{content}</code>
      </pre>
    </div>
  );
}

function InlineText({ content }: { content: string }) {
  // Very light markdown: **bold**, `inline code`, preserve newlines.
  const parts = content.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[12px] text-foreground"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {p.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </div>
  );
}

// Memoized so that re-renders of the parent chat component (which happen on
// every keystroke in the prompt box, every status-poll tick, and the running
// "elapsed" timer) do NOT re-parse and re-render every prior message. With the
// default shallow prop compare, a message whose `content` string is unchanged
// is skipped entirely — turning per-keystroke work from O(all messages) into
// O(only the message that actually changed). This was a real source of typing
// lag in long conversations.
export const AssistantMessage = memo(function AssistantMessage({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className="space-y-1">
      {blocks.map((b, i) =>
        b.type === "code" ? (
          <CodeBlock key={i} lang={b.lang} content={b.content} />
        ) : (
          <InlineText key={i} content={b.content} />
        ),
      )}
    </div>
  );
});
