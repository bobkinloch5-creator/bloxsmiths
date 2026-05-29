import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  X,
  UserPlus,
  UserMinus,
  UserX,
  Check,
  Heart,
  VolumeX,
  Volume2,
  Crown,
  Shield,
  Sparkles,
  Star,
  Loader2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import {
  getProfileCardRelations,
  toggleFollowUser,
  toggleBlockUser,
  manageFriendRequest,
  adminMuteUser,
} from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";

export type ProfileData = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  badges?: string[];
  banned?: boolean;
  muted_until?: string | null;
};

export const BADGE_DETAILS: Record<
  string,
  { label: string; icon: any; className: string; bg: string; border: string; text: string }
> = {
  owner: {
    label: "Owner",
    icon: Crown,
    className: "animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400 font-extrabold",
  },
  staff: {
    label: "Staff",
    icon: Shield,
    className: "shadow-[0_0_12px_rgba(139,92,246,0.4)]",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-400 font-extrabold",
  },
  premium_3: {
    label: "Premium Lvl 3",
    icon: Sparkles,
    className: "shadow-[0_0_12px_rgba(245,158,11,0.4)]",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400 font-extrabold",
  },
  premium_2: {
    label: "Premium Lvl 2",
    icon: Star,
    className: "shadow-[0_0_12px_rgba(6,182,212,0.4)]",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-400 font-bold",
  },
  premium_1: {
    label: "Premium Lvl 1",
    icon: Star,
    className: "shadow-[0_0_12px_rgba(156,163,175,0.3)]",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
    text: "text-gray-300 font-semibold",
  },
  famous: {
    label: "Famous",
    icon: Sparkles,
    className: "shadow-[0_0_12px_rgba(16,185,129,0.4)]",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400 font-bold",
  },
  tester: {
    label: "Tester",
    icon: Sparkles,
    className: "shadow-[0_0_10px_rgba(14,165,233,0.3)]",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    text: "text-sky-400 font-bold",
  },
};

export function UserBadgesList({ badges }: { badges?: string[] }) {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {badges.map((b) => {
        const detail = BADGE_DETAILS[b];
        if (!detail) return null;
        const Icon = detail.icon;

        return (
          <span
            key={b}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wider backdrop-blur-md ${detail.bg} ${detail.border} ${detail.text} ${detail.className}`}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {detail.label}
          </span>
        );
      })}
    </div>
  );
}

interface ProfileCardProps {
  profile: ProfileData;
  onClose: () => void;
  isStaff?: boolean;
}

export function ProfileCard({ profile, onClose, isStaff = false }: ProfileCardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [relations, setRelations] = useState<{
    isFollowing: boolean;
    isBlocked: boolean;
    friendship: { mine: boolean; status: string } | null;
    followersCount: number;
    followingCount: number;
  } | null>(null);

  const [banned, setBanned] = useState(profile.banned || false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(profile.muted_until || null);

  const fetchRelations = useServerFn(getProfileCardRelations);
  const follow = useServerFn(toggleFollowUser);
  const block = useServerFn(toggleBlockUser);
  const friend = useServerFn(manageFriendRequest);
  const muteUser = useServerFn(adminMuteUser);

  // Resolve the profile ID — use profile.id if present, else fall back to any
  // user_id-like field on the object (covers realtime-hydrated shapes)
  const profileId: string | undefined = profile.id || (profile as any).user_id;

  const loadCardData = async () => {
    // Guard: skip the server call when ID is missing or user isn't logged in
    if (!profileId || !user) {
      setLoading(false);
      return;
    }
    try {
      // 1. Fetch relations
      const res = await fetchRelations({ data: { targetId: profileId } });
      setRelations(res);

      // 2. Fetch live ban/mute status from profiles table
      const { data: liveProfile } = await supabase
        .from("profiles")
        .select("banned, muted_until")
        .eq("id", profileId)
        .maybeSingle();
      if (liveProfile) {
        setBanned(!!liveProfile.banned);
        setMutedUntil(liveProfile.muted_until);
      }
    } catch (err) {
      console.error("ProfileCard: failed to load relations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setRelations(null);
    loadCardData();
  }, [profileId]);

  const handleFollow = async () => {
    if (!user) return toast.error("Please sign in to follow creators.");
    if (!profileId) return toast.error("Cannot resolve this profile.");
    setActionLoading(true);
    try {
      const res = await follow({ data: { targetId: profileId } });
      toast.success(res.following ? `Following ${profile.display_name || "Builder"}` : `Unfollowed`);
      await loadCardData();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete follow.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!user) return toast.error("Please sign in to block users.");
    if (!profileId) return toast.error("Cannot resolve this profile.");
    const confirmBlock = relations?.isBlocked
      ? true
      : confirm(`Block ${profile.display_name || "user"}? You will not see their messages in the global chat.`);
    if (!confirmBlock) return;

    setActionLoading(true);
    try {
      const res = await block({ data: { targetId: profileId } });
      toast.success(res.blocked ? `Blocked ${profile.display_name || "user"}` : `Unblocked`);
      await loadCardData();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete block.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFriend = async (act: "send" | "accept" | "decline" | "cancel") => {
    if (!user) return toast.error("Please sign in to manage friends.");
    if (!profileId) return toast.error("Cannot resolve this profile.");
    setActionLoading(true);
    try {
      await friend({ data: { targetId: profileId, action: act } });
      toast.success(
        act === "send"
          ? "Friend request sent!"
          : act === "accept"
            ? "Friend request accepted!"
            : act === "decline"
              ? "Request declined."
              : "Request cancelled."
      );
      await loadCardData();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete friend action.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBanToggle = async () => {
    if (!profileId) return;
    if (banned) {
      if (!confirm(`Unban ${profile.display_name || "user"}?`)) return;
      setActionLoading(true);
      try {
        const { error } = await supabase.rpc("admin_set_ban", {
          _user_id: profileId,
          _banned: false,
          _reason: "",
        });
        if (error) throw error;
        setBanned(false);
        toast.success("User unbanned successfully.");
      } catch (err: any) {
        toast.error(err.message || "Failed to unban user.");
      } finally {
        setActionLoading(false);
      }
    } else {
      const reason = window.prompt(`Ban ${profile.display_name || "user"}? Enter reason:`, "Violated terms");
      if (!reason) return;
      setActionLoading(true);
      try {
        const { error } = await supabase.rpc("admin_set_ban", {
          _user_id: profileId,
          _banned: true,
          _reason: reason,
        });
        if (error) throw error;
        setBanned(true);
        toast.success("User banned successfully.");
      } catch (err: any) {
        toast.error(err.message || "Failed to ban user.");
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleMuteSelect = async (hours: number) => {
    if (!profileId) return;
    setActionLoading(true);
    try {
      const res = await muteUser({ data: { targetId: profileId, hours } });
      setMutedUntil(res.mutedUntil);
      toast.success(hours > 0 ? `User timed out for ${hours} hours.` : "User timeout cleared.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update timeout.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleKick = async () => {
    if (!profileId) return;
    if (!confirm(`Are you sure you want to Kick ${profile.display_name || "user"}? This will delete all of their messages sent in the last 2 hours.`)) return;
    setActionLoading(true);
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("community_messages")
        .delete()
        .eq("user_id", profileId)
        .gte("created_at", twoHoursAgo);
      if (error) throw error;
      toast.success("User kicked & chat messages cleared.");
    } catch (err: any) {
      toast.error(err.message || "Failed to kick user.");
    } finally {
      setActionLoading(false);
    }
  };

  const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${profileId || "unknown"}`;
  const isSelf = user && profileId && user.id === profileId;
  const canShowActions = user && profileId && !isSelf;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface-elevated/95 border border-border shadow-2xl overflow-hidden backdrop-blur-xl animate-scale-in">
        {/* Banner with absolute gradient overlays */}
        <div className="relative h-28 bg-gradient-brand">
          {profile.banner_url && (
            <img src={profile.banner_url} alt="Profile banner" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-elevated via-surface-elevated/30 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 border border-white/10 text-white grid place-items-center transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Box */}
        <div className="px-5 pb-5 relative -mt-9">
          {/* Avatar placement */}
          <div className="relative inline-block h-20 w-20 overflow-hidden rounded-2xl border-2 border-border/80 bg-surface shadow-xl">
            <img src={profile.avatar_url || fallbackAvatar} alt="Profile avatar" className="h-full w-full object-cover" />
          </div>

          <div className="mt-3 space-y-1">
            <h3 className="text-base font-bold text-foreground truncate">
              {profile.display_name || "Builder"}
            </h3>
            <div className="pt-1">
              <UserBadgesList badges={profile.badges} />
            </div>
          </div>

          {/* Social Stats */}
          <div className="mt-4 py-2 px-3 rounded-lg bg-surface/50 border border-border/40 grid grid-cols-2 text-center text-xs">
            <div>
              <div className="font-bold text-foreground">
                {loading ? "-" : relations?.followersCount ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Followers</div>
            </div>
            <div className="border-l border-border/40">
              <div className="font-bold text-foreground">
                {loading ? "-" : relations?.followingCount ?? 0}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Following</div>
            </div>
          </div>

          {/* Bio text */}
          <p className="mt-4 text-xs text-muted-foreground leading-relaxed italic bg-surface/20 p-2.5 rounded-lg border border-border/30 max-h-24 overflow-y-auto">
            {profile.bio || "No profile bio written yet. Busy building Roblox masterpieces!"}
          </p>

          {/* Guest prompt when not logged in */}
          {!user && (
            <div className="mt-5 text-center">
              <p className="text-[11px] text-muted-foreground mb-2">Sign in to follow, friend, and interact with creators.</p>
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm transition hover:bg-primary/90 active:scale-[0.98]"
              >
                <UserPlus className="h-3.5 w-3.5" /> Sign In
              </a>
            </div>
          )}

          {/* Action buttons — only for logged-in users viewing someone else's profile */}
          {canShowActions && (
            <div className="mt-5 grid grid-cols-2 gap-2">
              {/* Friend Requests / Friendship Status */}
              {loading ? (
                <button
                  disabled
                  className="col-span-2 inline-flex h-9 items-center justify-center rounded-xl bg-surface border border-border text-xs font-semibold text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading...
                </button>
              ) : (
                <>
                  {!relations?.friendship && (
                    <button
                      onClick={() => handleFriend("send")}
                      disabled={actionLoading}
                      className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-sm transition active:scale-[0.98]"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add Friend
                    </button>
                  )}

                  {relations?.friendship?.status === "pending" && relations?.friendship?.mine && (
                    <button
                      onClick={() => handleFriend("cancel")}
                      disabled={actionLoading}
                      className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface-elevated border border-border/80 hover:bg-surface text-xs font-semibold transition active:scale-[0.98]"
                    >
                      <UserMinus className="h-3.5 w-3.5 text-red-400" /> Cancel Request
                    </button>
                  )}

                  {relations?.friendship?.status === "pending" && !relations?.friendship?.mine && (
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleFriend("accept")}
                        disabled={actionLoading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-xs font-semibold transition active:scale-[0.98]"
                      >
                        <Check className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => handleFriend("decline")}
                        disabled={actionLoading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface border border-border hover:bg-surface-elevated text-xs font-semibold transition active:scale-[0.98]"
                      >
                        <X className="h-3.5 w-3.5 text-red-400" /> Decline
                      </button>
                    </div>
                  )}

                  {relations?.friendship?.status === "accepted" && (
                    <button
                      onClick={() => handleFriend("decline")}
                      disabled={actionLoading}
                      className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface border border-border/80 hover:bg-surface text-xs font-semibold transition active:scale-[0.98]"
                    >
                      <UserX className="h-3.5 w-3.5 text-red-400" /> Remove Friend
                    </button>
                  )}

                  {/* Follow & Block Column Actions */}
                  <button
                    onClick={handleFollow}
                    disabled={actionLoading}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                      relations?.isFollowing
                        ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
                        : "bg-surface border border-border hover:bg-surface-elevated text-foreground"
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${relations?.isFollowing ? "fill-primary text-primary" : ""}`} />
                    {relations?.isFollowing ? "Following" : "Follow"}
                  </button>

                  <button
                    onClick={handleBlock}
                    disabled={actionLoading}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition active:scale-[0.98] ${
                      relations?.isBlocked
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                        : "bg-surface border border-border hover:bg-surface-elevated text-foreground"
                    }`}
                  >
                    {relations?.isBlocked ? (
                      <>
                        <Volume2 className="h-3.5 w-3.5" /> Unblock
                      </>
                    ) : (
                      <>
                        <VolumeX className="h-3.5 w-3.5 text-red-400" /> Block
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Moderation Controls (Owner/Staff Only) */}
          {isStaff && profileId && !isSelf && (
            <div className="mt-5 border-t border-red-500/20 pt-4 space-y-3.5">
              <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase tracking-wider">
                <Shield className="h-4 w-4 animate-pulse text-red-500 fill-red-500/10" />
                <span>Moderation Portal</span>
              </div>

              {/* Status Indicator */}
              {(banned || (mutedUntil && new Date(mutedUntil) > new Date())) && (
                <div className="flex flex-wrap gap-1.5">
                  {banned && (
                    <span className="inline-flex items-center rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                      Banned User
                    </span>
                  )}
                  {mutedUntil && new Date(mutedUntil) > new Date() && (
                    <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      Timed Out until {new Date(mutedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {/* Kick Button */}
                <button
                  type="button"
                  onClick={handleKick}
                  disabled={actionLoading}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 text-xs font-semibold transition active:scale-[0.98]"
                  title="Remove user and delete recent spam"
                >
                  <VolumeX className="h-3.5 w-3.5" /> Kick / Purge
                </button>

                {/* Ban Button */}
                <button
                  type="button"
                  onClick={handleBanToggle}
                  disabled={actionLoading}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition active:scale-[0.98] ${
                    banned
                      ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400"
                  }`}
                >
                  <X className="h-3.5 w-3.5" />
                  {banned ? "Unban User" : "Ban User"}
                </button>
              </div>

              {/* Timeout/Mute Duration Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Apply Timeout (Mute Chat)
                </label>
                <select
                  disabled={actionLoading}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") return;
                    handleMuteSelect(parseInt(val, 10));
                  }}
                  value={mutedUntil && new Date(mutedUntil) > new Date() ? "active" : ""}
                  className="w-full rounded-lg bg-surface/50 border border-border px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-red-500/40 text-red-300"
                >
                  <option value="" className="text-foreground">No Active Timeout (Muted: No)</option>
                  {mutedUntil && new Date(mutedUntil) > new Date() && (
                    <option value="active" disabled className="text-amber-400">⏱️ Active (Timed Out)</option>
                  )}
                  <option value="1" className="text-foreground">⏱️ Mute for 1 Hour</option>
                  <option value="24" className="text-foreground">⏱️ Mute for 24 Hours</option>
                  <option value="168" className="text-foreground">⏱️ Mute for 7 Days</option>
                  <option value="0" className="text-foreground">🟢 Lift Timeout (Unmute)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
