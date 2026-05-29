import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2, Sparkles, Upload, UserRound } from "lucide-react";

const BUCKET = "profile-media";
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;
const MAX_BANNER_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function fileExt(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return ext;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

function initials(name?: string | null, email?: string | null) {
  const label = (name || email || "BloxSmith").trim();
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BS";
}

export function ProfileMediaSettings() {
  const { user, profile, refresh } = useAuth();
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || "");
  const [bannerPreview, setBannerPreview] = useState(profile?.banner_url || "");

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "BloxSmith Creator";

  async function uploadImage(kind: "avatar" | "banner", file: File) {
    if (!user) return toast.error("Please sign in first.");
    if (!ALLOWED_TYPES.includes(file.type)) {
      return toast.error("Please upload a PNG, JPG, WEBP, or GIF image.");
    }
    const maxSize = kind === "avatar" ? MAX_AVATAR_SIZE : MAX_BANNER_SIZE;
    if (file.size > maxSize) {
      return toast.error(kind === "avatar" ? "Avatar must be under 3 MB." : "Banner must be under 8 MB.");
    }

    setUploading(kind);
    try {
      const path = `${user.id}/${kind}-${Date.now()}.${fileExt(file)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const column = kind === "avatar" ? "avatar_url" : "banner_url";

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [column]: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) throw updateError;

      if (kind === "avatar") setAvatarPreview(publicUrl);
      else setBannerPreview(publicUrl);

      await refresh();
      toast.success(kind === "avatar" ? "Profile picture updated." : "Profile banner updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  function onFile(kind: "avatar" | "banner", file?: File | null) {
    if (!file) return;
    void uploadImage(kind, file);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-surface/20 shadow-[var(--shadow-elegant)]">
      <div className="relative h-44 bg-gradient-brand sm:h-56">
        {bannerPreview ? (
          <img src={bannerPreview} alt="Profile banner" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.25),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,.16),transparent_24%),linear-gradient(135deg,rgba(0,217,255,.35),rgba(124,60,255,.42))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/15 to-transparent" />
        <button
          type="button"
          onClick={() => bannerInput.current?.click()}
          disabled={!!uploading}
          className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 disabled:opacity-60"
        >
          {uploading === "banner" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          Change Banner
        </button>
        <input
          ref={bannerInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile("banner", e.target.files?.[0])}
        />
      </div>

      <div className="relative px-5 pb-6 sm:px-6">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="group relative grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-3xl border-4 border-background bg-surface-elevated text-3xl font-black shadow-2xl sm:h-32 sm:w-32">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profile avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="gradient-text">{initials(displayName, user?.email)}</span>
              )}
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                disabled={!!uploading}
                className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
                aria-label="Change profile picture"
              >
                {uploading === "avatar" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              </button>
              <input
                ref={avatarInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onFile("avatar", e.target.files?.[0])}
              />
            </div>

            <div className="pb-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-glow">
                <Sparkles className="h-3 w-3" /> Creator Profile
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{displayName}</h2>
              <p className="text-sm text-muted-foreground">Customize how your BloxSmith profile looks.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            disabled={!!uploading}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" /> Upload Avatar
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-background/35 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-bold text-foreground">
              <UserRound className="h-4 w-4 text-primary" /> Profile Picture
            </div>
            Recommended: square image, under 3 MB. PNG, JPG, WEBP, or GIF.
          </div>
          <div className="rounded-xl border border-border/50 bg-background/35 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-bold text-foreground">
              <ImageIcon className="h-4 w-4 text-primary" /> Banner Image
            </div>
            Recommended: wide 16:9 image, under 8 MB. Great for Roblox-style cover art.
          </div>
        </div>
      </div>
    </section>
  );
}
