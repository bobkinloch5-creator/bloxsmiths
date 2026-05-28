import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type PluginConnState = "connected" | "idle" | "offline" | "loading";

export type PluginConn = {
  state: PluginConnState;
  lastConnectedAt: string | null;
  placeName: string | null;
};

const FRESH_MS = 90_000; // active in last 90s
const IDLE_MS = 10 * 60_000; // seen in last 10 min

export function usePluginConnection(pollMs = 8000): PluginConn {
  const { user } = useAuth();
  const [conn, setConn] = useState<PluginConn>({
    state: "loading",
    lastConnectedAt: null,
    placeName: null,
  });

  useEffect(() => {
    if (!user) {
      setConn({ state: "offline", lastConnectedAt: null, placeName: null });
      return;
    }
    let cancelled = false;

    const tick = async () => {
      const { data } = await supabase
        .from("plugin_connections")
        .select("status,last_connected_at,studio_metadata")
        .eq("user_id", user.id)
        .order("last_connected_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const last = data?.last_connected_at ? new Date(data.last_connected_at).getTime() : 0;
      const age = Date.now() - last;
      const meta = (data?.studio_metadata as any) || {};
      const placeName = meta.placeName || meta.place_name || null;
      let state: PluginConnState = "offline";
      if (data && data.status === "active" && age < FRESH_MS) state = "connected";
      else if (data && age < IDLE_MS) state = "idle";
      setConn({ state, lastConnectedAt: data?.last_connected_at ?? null, placeName });
    };

    tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, pollMs]);

  return conn;
}
