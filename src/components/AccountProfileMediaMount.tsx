import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ProfileMediaSettings } from "@/components/ProfileMediaSettings";

const MOUNT_ID = "bloxsmith-account-profile-media-section";

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
  mount.className = "lg:col-span-12 space-y-6";

  const firstGrid = Array.from(main.querySelectorAll("div.grid")).find((el) =>
    el.className.includes("lg:grid-cols-12"),
  );

  if (firstGrid?.parentElement === main) {
    firstGrid.insertAdjacentElement("beforebegin", mount);
  } else {
    main.prepend(mount);
  }

  return mount;
}

export function AccountProfileMediaMount() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      if (cancelled) return;
      if (!isAccountPage()) {
        document.getElementById(MOUNT_ID)?.remove();
        setMountNode(null);
        return;
      }
      const node = ensureMountNode();
      if (node) setMountNode(node);
    };

    sync();
    const timer = window.setTimeout(sync, 250);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  if (!mountNode || !isAccountPage()) return null;
  return createPortal(<ProfileMediaSettings />, mountNode);
}
