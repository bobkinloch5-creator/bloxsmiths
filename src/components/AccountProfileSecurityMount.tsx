import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AccountSecurity } from "@/components/AccountSecurity";

const MOUNT_ID = "bloxsmith-account-security-profile-section";

function isAccountPage() {
  return typeof window !== "undefined" && window.location.pathname === "/account";
}

function ensureMountNode() {
  if (!isAccountPage()) return null;

  let mount = document.getElementById(MOUNT_ID);
  if (mount) return mount;

  const main = document.querySelector("main");
  if (!main) return null;

  mount = document.createElement("div");
  mount.id = MOUNT_ID;
  mount.className = "lg:col-span-7 space-y-6";

  const primaryColumns = Array.from(main.querySelectorAll("div.grid")).find((el) =>
    el.className.includes("lg:grid-cols-12"),
  );

  if (primaryColumns?.parentElement === main) {
    primaryColumns.insertAdjacentElement("afterend", mount);
  } else {
    const dangerZoneGrid = Array.from(main.querySelectorAll("div.grid")).find((el) =>
      el.textContent?.includes("Danger Zone"),
    );
    if (dangerZoneGrid) {
      dangerZoneGrid.insertAdjacentElement("beforebegin", mount);
    } else {
      main.appendChild(mount);
    }
  }

  return mount;
}

export function AccountProfileSecurityMount() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    const sync = () => {
      if (cancelled) return;
      if (!isAccountPage()) {
        const existing = document.getElementById(MOUNT_ID);
        existing?.remove();
        setMountNode(null);
        return;
      }
      const node = ensureMountNode();
      if (node) setMountNode(node);
    };

    sync();
    const timer = window.setTimeout(sync, 250);

    observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", sync);
    window.addEventListener("pushstate", sync as EventListener);
    window.addEventListener("replacestate", sync as EventListener);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pushstate", sync as EventListener);
      window.removeEventListener("replacestate", sync as EventListener);
    };
  }, []);

  if (!mountNode || !isAccountPage()) return null;
  return createPortal(<AccountSecurity />, mountNode);
}
