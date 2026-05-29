import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { logUserActivity } from "@/lib/activity.functions";

export function RouteTracker() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const lastLoggedPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastLoggedPath.current) return;

    lastLoggedPath.current = pathname;

    const track = async () => {
      try {
        await logUserActivity({
          eventType: "page_view",
          description: `Visited ${pathname}`,
          path: pathname,
          userId: user?.id || null,
        });
      } catch (err) {
        console.error("Failed to log page view:", err);
      }
    };
    track();
  }, [pathname, user?.id]);

  return null;
}
