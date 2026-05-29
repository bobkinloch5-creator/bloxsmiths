import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// Helper to get service role client for high-privilege admin operations if needed
function getAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 1. Get Global Community Chat Messages
export const getCommunityMessages = createServerFn({ method: "GET" })
  .handler(async () => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key);

    const { data, error } = await sb
      .from("community_messages")
      .select(`
        id,
        created_at,
        user_id,
        content,
        is_reported,
        profiles!community_messages_user_id_fkey (
          id,
          display_name,
          email,
          avatar_url,
          banner_url,
          bio,
          badges,
          banned
        )
      `)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      // Fallback if schema is not yet applied to the cloud DB
      if (error.message.includes("does not exist")) {
        return [];
      }
      throw new Error(error.message);
    }
    return data || [];
  });

const BANNED_WORDS = [
  "fuck", "shit", "asshole", "bitch", "bastard", "cunt", "dick", "pussy",
  "nigger", "faggot", "retard", "slut", "whore", "rape", "dumbass",
  "motherfucker", "cocksucker", "twat", "wanker", "prick"
];

function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  for (const word of BANNED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(text) || regex.test(normalized)) {
      return true;
    }
  }
  return false;
}

// 2. Send Chat Message
export const sendCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ content: z.string().min(1).max(1000) }).parse(input)
  )
  .handler(async ({ data: { content }, context }) => {
    const { supabase, userId } = context;
    const trimmed = content.trim();

    // 1. Swear / Profanity Filter
    if (containsProfanity(trimmed)) {
      throw new Error("Message blocked: Please keep language family-friendly and respectful.");
    }

    // Check if banned or muted
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("banned, muted_until")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) throw new Error(pErr.message);
    if (profile?.banned) throw new Error("Your account has been banned.");
    if (profile?.muted_until && new Date(profile.muted_until) > new Date()) {
      throw new Error(`You are muted until ${new Date(profile.muted_until).toLocaleString()}`);
    }

    // 2. Anti-Spam: Fetch last message to check cooldown and duplicates
    const { data: lastMsg } = await supabase
      .from("community_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMsg) {
      // Cooldown check (2 seconds)
      const lastTime = new Date(lastMsg.created_at).getTime();
      if (Date.now() - lastTime < 2000) {
        throw new Error("Please wait 2 seconds between messages.");
      }
      // Duplicate check
      if (lastMsg.content.toLowerCase() === trimmed.toLowerCase()) {
        throw new Error("Duplicate message detected. Please do not spam the same message.");
      }
    }

    // Insert message
    const { data, error } = await supabase
      .from("community_messages")
      .insert({
        user_id: userId,
        content: trimmed,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // 3. Reward credits: 1 credit per 10 messages sent
    try {
      const { count } = await supabase
        .from("community_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (count && count > 0 && count % 10 === 0) {
        const sbAdmin = getAdminClient();
        await sbAdmin.rpc("grant_credits_service", {
          _user_id: userId,
          _amount: 1,
          _reason: `Community chat reward: ${count} messages sent`,
        });
      }
    } catch (rewardErr) {
      // Log error but do not fail the chat message delivery if reward insertion fails
      console.error("Failed to award community chat credit:", rewardErr);
    }

    return data;
  });

// 3. Report Chat Message
export const reportCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), reason: z.string().min(3).max(200) }).parse(input)
  )
  .handler(async ({ data: { messageId, reason }, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("community_messages")
      .select("reported_by")
      .eq("id", messageId)
      .maybeSingle();

    const reportedBy = Array.isArray(existing?.reported_by) ? existing.reported_by : [];
    if (reportedBy.includes(userId)) {
      return { ok: true, alreadyReported: true };
    }

    const updatedReportedBy = [...reportedBy, userId];

    const { error } = await supabase
      .from("community_messages")
      .update({
        is_reported: true,
        report_reason: reason,
        reported_by: updatedReportedBy,
      })
      .eq("id", messageId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 4. Delete Chat Message (Authors, Admins, or Staff)
export const deleteCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { messageId }, context }) => {
    const { supabase, userId } = context;

    // Load message to check ownership
    const { data: msg } = await supabase
      .from("community_messages")
      .select("user_id")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) throw new Error("Message not found");

    // Check if user is staff/admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("badges")
      .eq("id", userId)
      .maybeSingle();

    const badges = profile?.badges || [];
    const isStaff = badges.includes("owner") || badges.includes("staff") || badges.includes("admin");

    if (msg.user_id !== userId && !isStaff) {
      throw new Error("Unauthorized");
    }

    const { error } = await supabase
      .from("community_messages")
      .delete()
      .eq("id", messageId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 5. Follow / Unfollow User
export const toggleFollowUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { targetId }, context }) => {
    const { supabase, userId } = context;
    if (userId === targetId) throw new Error("You cannot follow yourself");

    const { data: existing } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("following_id", targetId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("user_follows").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { following: false };
    } else {
      const { error } = await supabase.from("user_follows").insert({
        follower_id: userId,
        following_id: targetId,
      });
      if (error) throw new Error(error.message);
      return { following: true };
    }
  });

// 6. Block / Unblock User
export const toggleBlockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { targetId }, context }) => {
    const { supabase, userId } = context;
    if (userId === targetId) throw new Error("You cannot block yourself");

    const { data: existing } = await supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_id", targetId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("blocked_users").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { blocked: false };
    } else {
      const { error } = await supabase.from("blocked_users").insert({
        blocker_id: userId,
        blocked_id: targetId,
      });
      if (error) throw new Error(error.message);
      return { blocked: true };
    }
  });

// 7. Friend Request Management (Send request / accept / decline / cancel)
export const manageFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      targetId: z.string().uuid(),
      action: z.enum(["send", "accept", "decline", "cancel"]),
    }).parse(input)
  )
  .handler(async ({ data: { targetId, action }, context }) => {
    const { supabase, userId } = context;
    if (userId === targetId) throw new Error("Invalid operation");

    if (action === "send") {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: userId,
        receiver_id: targetId,
        status: "pending",
      });
      if (error) throw new Error(error.message);
      return { ok: true, status: "pending" };
    }

    if (action === "accept") {
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("sender_id", targetId)
        .eq("receiver_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true, status: "accepted" };
    }

    if (action === "decline") {
      const { error } = await supabase
        .from("friend_requests")
        .delete()
        .eq("sender_id", targetId)
        .eq("receiver_id", userId);
      if (error) throw new Error(error.message);
      return { ok: true, status: "declined" };
    }

    if (action === "cancel") {
      const { error } = await supabase
        .from("friend_requests")
        .delete()
        .eq("sender_id", userId)
        .eq("receiver_id", targetId);
      if (error) throw new Error(error.message);
      return { ok: true, status: "cancelled" };
    }

    return { ok: false };
  });

// 8. Search User Profiles
export const searchUserProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string() }).parse(input))
  .handler(async ({ data: { query }, context }) => {
    const { supabase } = context;
    if (query.trim().length < 2) return [];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url, bio, badges")
      .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(30);

    if (error) throw new Error(error.message);
    return data || [];
  });

// 9. Get profile counts & relations for sleek ProfileCard
export const getProfileCardRelations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { targetId }, context }) => {
    const { supabase, userId } = context;

    // Follow status
    const { data: follow } = await supabase
      .from("user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("following_id", targetId)
      .maybeSingle();

    // Block status
    const { data: block } = await supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", userId)
      .eq("blocked_id", targetId)
      .maybeSingle();

    // Friend requests
    const { data: reqOut } = await supabase
      .from("friend_requests")
      .select("status")
      .eq("sender_id", userId)
      .eq("receiver_id", targetId)
      .maybeSingle();

    const { data: reqIn } = await supabase
      .from("friend_requests")
      .select("status")
      .eq("sender_id", targetId)
      .eq("receiver_id", userId)
      .maybeSingle();

    // Stats
    const { count: followers } = await supabase
      .from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", targetId);

    const { count: following } = await supabase
      .from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", targetId);

    return {
      isFollowing: !!follow,
      isBlocked: !!block,
      friendship: reqOut ? { mine: true, status: reqOut.status } : reqIn ? { mine: false, status: reqIn.status } : null,
      followersCount: followers || 0,
      followingCount: following || 0,
    };
  });

// 10. Admin: Manage User Badges
export const adminManageUserBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      targetId: z.string().uuid(),
      badge: z.enum(["owner", "staff", "premium_1", "premium_2", "premium_3", "famous"]),
      action: z.enum(["grant", "revoke"]),
    }).parse(input)
  )
  .handler(async ({ data: { targetId, badge, action }, context }) => {
    const { supabase, userId } = context;

    // Verify requesting user is admin/owner in DB
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) throw new Error("Forbidden");

    // Fetch user current badges
    const { data: profile } = await supabase
      .from("profiles")
      .select("badges")
      .eq("id", targetId)
      .single();

    const currentBadges: string[] = profile?.badges || [];
    let updatedBadges: string[];

    if (action === "grant") {
      updatedBadges = Array.from(new Set([...currentBadges, badge]));
    } else {
      updatedBadges = currentBadges.filter((b) => b !== badge);
    }

    const sbAdmin = getAdminClient();
    const { error } = await sbAdmin
      .from("profiles")
      .update({ badges: updatedBadges })
      .eq("id", targetId);

    if (error) throw new Error(error.message);
    return { ok: true, badges: updatedBadges };
  });

// 11. Admin: Manage Muting & Dismissing Reports
export const adminMuteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      targetId: z.string().uuid(),
      hours: z.number().int().min(0).max(8760), // 0 to unmute, up to 1 year
    }).parse(input)
  )
  .handler(async ({ data: { targetId, hours }, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) throw new Error("Forbidden");

    const mutedUntil = hours > 0 ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;

    const sbAdmin = getAdminClient();
    const { error } = await sbAdmin
      .from("profiles")
      .update({ muted_until: mutedUntil })
      .eq("id", targetId);

    if (error) throw new Error(error.message);
    return { ok: true, mutedUntil };
  });

// 12. Admin: Dismiss message report
export const adminDismissMessageReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { messageId }, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await supabase
      .from("community_messages")
      .update({ is_reported: false, report_reason: null, reported_by: [] })
      .eq("id", messageId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
