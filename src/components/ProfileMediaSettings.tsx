import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createRobloxStyleAvatar } from "@/lib/generated-avatar";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Loader2, Sparkles, Upload, UserRound } from "lucide-react";

const BUCKET = "profile-media";
const MAX_AVATAR_SIZE = 6 * 1024 * 1024;
const MAX_BANNER_SIZE = 12 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type MediaKind = "avatar" | "banner";

function fileExt(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load this image."));
    img.src = src;
  });
}

async function compressImage(file: File, kind: MediaKind): Promise<{ blob: Blob; dataUrl: string; ext: string }> {
  if (file.type === "image/gif") {
    const dataUrl = await readAsDataUrl(file);
    return { blob: file, dataUrl, ext: fileExt(file) };
  }

  const source = await readAsDataUrl(file);
  const img = await loadImage(source);
  const maxWidth = kind === "avatar" ? 512 : 1800;
  const maxHeight = kind === "avatar" ? 512 : 620;
  const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process this image.");
  ctx.drawImage(img, 0, 0, width, height);

  const quality = kind === "avatar" ? 0.88 : 0.82;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Image compression failed."))), "image/webp", quality);
  });
  return { blob, dataUrl: canvas.toDataURL("image/webp", quality), ext: "webp" };
}

function storageErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (/bucket/i.test(msg) || /not found/i.test(msg)) {
    return "Profile media storage is not ready yet. Saved using account metadata fallback.";
  }
  if (/policy|row-level|rls|permission|unauthorized/i.test(msg)) {
    return "Storage permissions blocked the upload. Saved using account metadata fallback.";
  }
  return msg || "Upload failed.";
}

export function ProfileMediaSettings() {
  const { user, profile, refresh } = useAuth();
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState<MediaKind | null>(null);
  const fallbackAvatar = createRobloxStyleAvatar(user?.id || user?.email);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || user?.user_metadata?.avatar_url || "");
  const [bannerPreview, setBannerPreview] = useState(profile?.banner_url || user?.user_metadata?.banner_url || "");

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "BloxSmith Creator";

  useEffect(() => {
    setAvatarPreview(profile?.avatar_url || user?.user_metadata?.avatar_url || "");
    setBannerPreview(profile?.banner_url || user?.user_metadata?.banner_url || "");
  }, [profile?.avatar_url, profile?.banner_url, user?.user_metadata?.avatar_url, user?.user_metadata?.banner_url]);

  async function saveUrl(kind: MediaKind, url: string) {
    if (!user) throw new Error("Please sign in first.");
    const column = kind === "avatar" ? "avatar_url" : "banner_url";
    const metadataKey = kind === "avatar" ? "avatar_url" : "banner_url";

    const profileUpdate = await supabase
      .from("profiles")
      .update({ [column]: url, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (profileUpdate.error) {
      // If the banner column has not been migrated yet, keep the media working by saving to Supabase Auth metadata.
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, [metadataKey]: url },
      });
      if (metadataError) throw profileUpdate.error;
    }
  }

  async function uploadToStorage(kind: MediaKind, blob: Blob, ext: string) {
    if (!user) throw new Error("Please sign in first.");
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
      cacheControl: "3600",
      contentType: blob.type || (ext === "webp" ? "image/webp" : undefined),
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadImage(kind: MediaKind, file: File) {
    if (!user) return toast.error("Please sign in first.");
    if (!ALLOWED_TYPES.includes(file.type)) return toast.error("Please upload a PNG, JPG, WEBP, or GIF image.");
    const maxSize = kind === "avatar" ? MAX_AVATAR_SIZE : MAX_BANNER_SIZE;
    if (file.size > maxSize) return toast.error(kind === "avatar" ? "Avatar must be under 6 MB." : "Banner must be under 12 MB.");

    setUploading(kind);
    try {
      const optimized = await compressImage(file, kind);
      if (kind === "avatar") setAvatarPreview(optimized.dataUrl);
      else setBannerPreview(optimized.dataUrl);

      let finalUrl = optimized.dataUrl;
      try {
        finalUrl = await uploadToStorage(kind, optimized.blob, optimized.ext);
      } catch (storageErr) {
        console.warn("[profile-media] storage upload failed, using metadata fallback:", storageErr);
        toast.info(storageErrorMessage(storageErr));
      }

      await saveUrl(kind, finalUrl);
      if (kind === "avatar") setAvatarPreview(finalUrl);
      else setBannerPreview(finalUrl);

      await refresh();
      toast.success(kind === "avatar" ? "Profile picture updated." : "Profile banner updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(null);
      if (kind === "avatar" && avatarInput.current) avatarInput.current.value = "";
      if (kind === "banner" && bannerInput.current) bannerInput.current.value = "";
    }
  }

  function onFile(kind: MediaKind, file?: File | null) {
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
              <img src={avatarPreview || fallbackAvatar} alt="Profile avatar" className="h-full w-full object-cover" />
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
            Upload an image or use the auto-generated Roblox-style avatar fallback.
          </div>
          <div className="rounded-xl border border-border/50 bg-background/35 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 font-bold text-foreground">
              <ImageIcon className="h-4 w-4 text-primary" /> Banner Image
            </div>
            Wide banners are compressed automatically so uploads work faster.
          </div>
        </div>
      </div>
    </section>
  );
}
