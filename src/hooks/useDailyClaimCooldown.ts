import { useEffect, useState, useCallback } from "react";

const key = (userId?: string) => `bs_daily_claim_next_${userId ?? "anon"}`;

function nextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.getTime();
}

function format(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function useDailyClaimCooldown(userId?: string) {
  const [nextAt, setNextAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(key(userId));
    return v ? Number(v) : null;
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(key(userId));
    setNextAt(v ? Number(v) : null);
  }, [userId]);

  useEffect(() => {
    if (!nextAt || nextAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextAt]);

  const start = useCallback(() => {
    const t = nextUtcMidnight();
    localStorage.setItem(key(userId), String(t));
    setNextAt(t);
    setNow(Date.now());
  }, [userId]);

  const remaining = nextAt ? Math.max(0, nextAt - now) : 0;
  const onCooldown = remaining > 0;
  return { onCooldown, remaining, label: format(remaining), start };
}
