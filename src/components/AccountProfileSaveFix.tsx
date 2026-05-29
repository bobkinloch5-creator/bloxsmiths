import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ATTR = "data-bloxsmith-profile-save-fixed";

function getInputValue(labelText: string) {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").toLowerCase().includes(labelText));
  const wrapper = label?.parentElement;
  const field = wrapper?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select",
  );
  return field?.value?.trim() ?? "";
}

async function tryProfileUpdate(userId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("profiles").update(values as any).eq("id", userId);
  return !error;
}

async function saveProfileSettings() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) {
    toast.error("Please sign in first.");
    return;
  }

  const displayName = getInputValue("display name") || user.email?.split("@")[0] || "Roblox Creator";
  const specialization = getInputValue("studio specialty") || "General Builder";
  const bio = getInputValue("profile bio");

  const metadata = {
    ...(user.user_metadata ?? {}),
    display_name: displayName,
    specialization,
    bio,
  };

  const saving = toast.loading("Saving profile settings...");

  try {
    // Save the most important field first. This works even on older profile tables.
    const displaySaved = await tryProfileUpdate(user.id, {
      display_name: displayName,
      updated_at: new Date().toISOString(),
    });

    // Optional fields may not exist yet on some Supabase databases, so save them
    // individually and mirror everything into auth metadata as a guaranteed fallback.
    await Promise.allSettled([
      tryProfileUpdate(user.id, { bio, updated_at: new Date().toISOString() }),
      tryProfileUpdate(user.id, { specialization, updated_at: new Date().toISOString() }),
      supabase.auth.updateUser({ data: metadata }),
    ]);

    if (!displaySaved) {
      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;
    }

    window.dispatchEvent(new CustomEvent("bloxsmith:profile-saved"));
    toast.success("Profile settings saved.", { id: saving });
    window.setTimeout(() => window.location.reload(), 450);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Profile settings could not be saved.", {
      id: saving,
    });
  }
}

function patchSaveButton() {
  if (!location.pathname.includes("/account")) return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  const button = buttons.find((item) =>
    (item.textContent || "").toLowerCase().includes("save profile details"),
  );
  if (!button || button.getAttribute(ATTR) === "true") return;
  button.setAttribute(ATTR, "true");
  button.type = "button";

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void saveProfileSettings();
    },
    true,
  );
}

export function AccountProfileSaveFix() {
  useEffect(() => {
    patchSaveButton();
    const observer = new MutationObserver(patchSaveButton);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", patchSaveButton);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", patchSaveButton);
    };
  }, []);

  return null;
}
