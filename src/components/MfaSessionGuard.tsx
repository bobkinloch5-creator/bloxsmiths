import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
]);

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/")) return true;
  return false;
}

/**
 * Keeps 2FA-enabled users from entering protected app pages until their
 * current Supabase session has been verified at AAL2.
 */
export function MfaSessionGuard() {
  const nav = useNavigate();
  const location = useLocation();
  const notifyingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const enforceMfa = async () => {
      const pathname = window.location.pathname;
      if (pathname === "/mfa" || isPublicPath(pathname)) return;

      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled || !sessionData.session) return;

      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled || error) return;

      if (data?.nextLevel === "aal2" && data?.currentLevel !== "aal2") {
        if (!notifyingRef.current) {
          notifyingRef.current = true;
          toast.info("Enter your 2FA code to finish signing in.");
          window.setTimeout(() => {
            notifyingRef.current = false;
          }, 2500);
        }
        nav({
          to: "/mfa",
          search: { redirect: pathname } as never,
          replace: true,
        });
      }
    };

    void enforceMfa();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void enforceMfa(), 0);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [location.pathname, nav]);

  return null;
}
