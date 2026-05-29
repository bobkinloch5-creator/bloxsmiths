import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
const supabase = typedSupabase as any;

// Helper to get service role client for high-privilege admin operations if needed
function getAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Helper to log user activity directly from server functions using the admin client
async function logActivityRaw(
  sbAdmin: any,
  userId: string | null,
  eventType: string,
  description: string,
  path?: string | null,
  metadata?: any
) {
  try {
    await sbAdmin.from("activity_logs").insert({
      user_id: userId,
      event_type: eventType,
      description: description,
      path: path || null,
      metadata: metadata || null,
    });
  } catch (e) {
    console.error("Failed to write raw activity log:", e);
  }
}

// Helper to ensure ModBot profile exists in profiles table
async function getOrCreateModBot(sbAdmin: any): Promise<string> {
  const modBotId = "00000000-0000-0000-0000-000000000000";
  try {
    const { data: existing } = await sbAdmin
      .from("profiles")
      .select("id")
      .eq("id", modBotId)
      .maybeSingle();

    if (!existing) {
      await sbAdmin.from("profiles").insert({
        id: modBotId,
        email: "modbot@bloxsmith.pro",
        display_name: "ModBot 🤖",
        avatar_url: "https://api.dicebear.com/7.x/bottts/svg?seed=modbot",
        banner_url: null,
        bio: "Automated community moderation guardian for BloxSmith.",
        badges: ["staff"],
        credits: 999999,
        banned: false,
      });
    }
  } catch (err) {
    console.error("Error ensuring ModBot profile:", err);
  }
  return modBotId;
}

// Helper to handle ModBot warnings and mutes
async function handleModBotWarning(
  sbAdmin: any,
  userId: string,
  profile: { display_name: string | null; email: string },
  warningReason: string,
  warningText: string
): Promise<string> {
  const modBotId = await getOrCreateModBot(sbAdmin);
  const userLabel = profile.display_name || profile.email.split("@")[0] || "Builder";

  // 1. Log the warning event in activity logs
  await logActivityRaw(
    sbAdmin,
    userId,
    "moderation_warning",
    `ModBot warning: ${warningReason}`,
    null,
    { reason: warningReason }
  );

  // 2. Count warnings in the last 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await sbAdmin
    .from("activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "moderation_warning")
    .gte("created_at", oneHourAgo);

  const warnings = count ?? 0;

  if (warnings >= 3) {
    // Apply 1 hour timeout (mute)
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await sbAdmin
      .from("profiles")
      .update({ muted_until: mutedUntil })
      .eq("id", userId);

    // Post bot announcement in chat
    await sbAdmin.from("community_messages").insert({
      user_id: modBotId,
      content: `ModBot 🤖: @${userLabel} has been muted for 1 hour due to repeated language/spam violations.`,
    });

    // Write activity log for mute
    await logActivityRaw(
      sbAdmin,
      userId,
      "moderation_mute",
      "User was auto-muted for 1 hour by ModBot due to repeated violations."
    );

    return `You have been muted for 1 hour by ModBot due to repeated language/spam violations.`;
  } else {
    // Post warning message in chat
    await sbAdmin.from("community_messages").insert({
      user_id: modBotId,
      content: `ModBot 🤖: Warning! @${userLabel}, ${warningText} Warned (${warnings}/3).`,
    });

    return `Message blocked: ${warningText}`;
  }
}

// 1. Get Global Community Chat Messages
export const getCommunityMessages = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
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
  "motherfucker", "cocksucker", "twat", "wanker", "prick", "stfu",
  "kys", "nigg", "niga", "niger", "f4g", "fag", "homo", "tranny",
];

// Leet-speak substitution map for bypass detection
const LEET_MAP: Record<string, string> = {
  "@": "a", "4": "a", "^": "a",
  "8": "b",
  "(": "c", "<": "c",
  "3": "e",
  "1": "i", "!": "i", "|": "i",
  "0": "o",
  "$": "s", "5": "s",
  "7": "t", "+": "t",
  "v": "u",
  "9": "g",
};

function normalizeLeet(text: string): string {
  let result = "";
  for (const ch of text) {
    result += LEET_MAP[ch] || ch;
  }
  return result;
}

function containsProfanity(text: string): boolean {
  // 1. Straight lowercase check
  const lower = text.toLowerCase();

  // 2. Strip ALL non-alpha characters (catches "f u c k", "f.u.c.k", "f_u_c_k")
  const stripped = lower.replace(/[^a-z]/g, "");

  // 3. Leet-speak normalization then strip non-alpha
  const leetNormalized = normalizeLeet(lower).replace(/[^a-z]/g, "");

  // 4. Strip only special chars but keep spaces (for word-boundary checks)
  const spacedNorm = lower.replace(/[^a-z0-9\s]/g, "");
  const leetSpaced = normalizeLeet(lower).replace(/[^a-z\s]/g, "");

  for (const word of BANNED_WORDS) {
    // Direct word-boundary match on original and normalized
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower) || regex.test(spacedNorm) || regex.test(leetSpaced)) {
      return true;
    }
    // Substring match on fully stripped versions (catches spacing tricks)
    if (stripped.includes(word) || leetNormalized.includes(word)) {
      return true;
    }
  }
  return false;
}

// Detect caps-spam (over 70% uppercase in messages longer than 6 chars)
function isCapsSpam(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 7) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7;
}

// Detect suspicious link spam
function isLinkSpam(text: string): boolean {
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const matches = text.match(urlPattern);
  return (matches?.length ?? 0) >= 3;
}

// 2. Send Chat Message
export const sendCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ content: z.string().min(1).max(1000) }).parse(input)
  )
  .handler(async ({ data: { content }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const trimmed = content.trim();

    // Check if banned or muted, and get profile details
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("display_name, email, banned, muted_until")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) throw new Error(pErr.message);
    if (profile?.banned) throw new Error("Your account has been banned.");
    if (profile?.muted_until && new Date(profile.muted_until) > new Date()) {
      throw new Error(`You are muted until ${new Date(profile.muted_until).toLocaleString()}`);
    }

    // 1. Swear / Profanity Filter
    if (containsProfanity(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin,
        userId,
        profile || { display_name: null, email: "unknown@bloxsmith.pro" },
        "profanity",
        "please keep language family-friendly and respectful."
      );
      throw new Error(errMsg);
    }

    // 1b. Caps-spam check
    if (isCapsSpam(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin,
        userId,
        profile || { display_name: null, email: "unknown@bloxsmith.pro" },
        "caps_spam",
        "please stop typing in all caps. It is considered shouting/spam."
      );
      throw new Error(errMsg);
    }

    // 1c. Link-spam check
    if (isLinkSpam(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin,
        userId,
        profile || { display_name: null, email: "unknown@bloxsmith.pro" },
        "link_spam",
        "posting multiple links at once is not allowed."
      );
      throw new Error(errMsg);
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
      const lastTime = new Date(lastMsg.created_at).getTime();
      const elapsedMs = Date.now() - lastTime;

      // Configurable slowmode. Owner/admin/staff are exempt so they can moderate
      // freely. Everyone else must wait `slowmode_seconds` (set by admins, default 2).
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const { data: badgeRow } = await supabase
        .from("profiles")
        .select("badges")
        .eq("id", userId)
        .maybeSingle();
      const isStaff =
        (roleRows ?? []).some((r: any) => r.role === "owner" || r.role === "admin") ||
        ((badgeRow?.badges as string[] | null) ?? []).some((b) =>
          ["owner", "admin", "staff"].includes(b),
        );

      let slowmodeMs = 2000;
      if (!isStaff) {
        const { data: cs } = await supabase
          .from("chat_settings")
          .select("slowmode_seconds")
          .eq("id", 1)
          .maybeSingle();
        if (cs && typeof cs.slowmode_seconds === "number") {
          slowmodeMs = Math.max(0, cs.slowmode_seconds) * 1000;
        }
        if (slowmodeMs > 0 && elapsedMs < slowmodeMs) {
          const wait = Math.ceil((slowmodeMs - elapsedMs) / 1000);
          const sbAdmin = getAdminClient();
          const errMsg = await handleModBotWarning(
            sbAdmin,
            userId,
            profile || { display_name: null, email: "unknown@bloxsmith.pro" },
            "slowmode_violation",
            `slowmode is active. Please wait ${wait} more second${wait === 1 ? "" : "s"}.`
          );
          throw new Error(errMsg);
        }
      }

      // Duplicate check (only within 10 seconds)
      if (lastMsg.content.toLowerCase() === trimmed.toLowerCase() && elapsedMs < 10000) {
        const sbAdmin = getAdminClient();
        const errMsg = await handleModBotWarning(
          sbAdmin,
          userId,
          profile || { display_name: null, email: "unknown@bloxsmith.pro" },
          "duplicate_message",
          "please avoid sending the same message repeatedly."
        );
        throw new Error(errMsg);
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

    // Write activity log for chat message
    const sbAdmin = getAdminClient();
    await logActivityRaw(
      sbAdmin,
      userId,
      "chat_message",
      `Sent a chat message: "${trimmed.slice(0, 60)}${trimmed.length > 60 ? "..." : ""}"`
    );

    // 3. Reward credits: 1 credit per 10 messages sent
    let creditAwarded = false;
    let totalMessages = 0;
    try {
      const { count } = await supabase
        .from("community_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      totalMessages = count ?? 0;

      if (count && count > 0 && count % 10 === 0) {
        await sbAdmin.rpc("grant_credits_service", {
          _user_id: userId,
          _amount: 1,
          _reason: `Community chat reward: ${count} messages sent`,
        });
        creditAwarded = true;
      }
    } catch (rewardErr) {
      // Log error but do not fail the chat message delivery if reward insertion fails
      console.error("Failed to award community chat credit:", rewardErr);
    }

    return { message: data, creditAwarded, totalMessages };
  });

// 3. Report Chat Message
export const reportCommunityMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), reason: z.string().min(3).max(200) }).parse(input)
  )
  .handler(async ({ data: { messageId, reason }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

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
    const supabase = context.supabase as any;
    const { userId } = context;

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
    const supabase = context.supabase as any;
    const { userId } = context;
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
    const supabase = context.supabase as any;
    const { userId } = context;
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
    const supabase = context.supabase as any;
    const { userId } = context;
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
    const supabase = context.supabase as any;
    const { userId } = context;

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
      badge: z.enum(["owner", "staff", "admin", "premium_1", "premium_2", "premium_3", "famous", "tester"]),
      action: z.enum(["grant", "revoke"]),
    }).parse(input)
  )
  .handler(async ({ data: { targetId, badge, action }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

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

    await logActivityRaw(
      sbAdmin,
      userId,
      "admin_badge_change",
      `Badges managed for user ${targetId}: ${action} ${badge}`,
      null,
      { targetId, badge, action }
    );

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
    const supabase = context.supabase as any;
    const { userId } = context;

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

    await logActivityRaw(
      sbAdmin,
      userId,
      "admin_mute",
      hours > 0 ? `Muted user ${targetId} for ${hours} hours` : `Unmuted user ${targetId}`,
      null,
      { targetId, hours }
    );

    return { ok: true, mutedUntil };
  });

// 12. Admin: Dismiss message report
export const adminDismissMessageReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data: { messageId }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await supabase
      .from("community_messages")
      .update({ is_reported: false, report_reason: null, reported_by: [] })
      .eq("id", messageId);

    if (error) throw new Error(error.message);

    const sbAdmin = getAdminClient();
    await logActivityRaw(
      sbAdmin,
      userId,
      "admin_dismiss_report",
      `Dismissed report for message ${messageId}`,
      null,
      { messageId }
    );

    return { ok: true };
  });

// ── Community chat slowmode ────────────────────────────────────────────────

/** Anyone can read the current slowmode (seconds). */
export const getChatSlowmode = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabase
    .from("chat_settings")
    .select("slowmode_seconds")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    // If the table isn't there yet, fall back to the default.
    return { slowmodeSeconds: 2 };
  }
  return { slowmodeSeconds: data?.slowmode_seconds ?? 2 };
});

/** Owner/admin only: set the slowmode in seconds (0–3600). */
export const setChatSlowmode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ seconds: z.number().int().min(0).max(3600) }).parse(input),
  )
  .handler(async ({ data: { seconds }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

    // Verify owner/admin in DB (do not trust the client).
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "owner");
    if (!isAdmin) throw new Error("Forbidden — only owners/admins can change slowmode.");

    const sbAdmin = getAdminClient();
    const { error } = await sbAdmin
      .from("chat_settings")
      .update({ slowmode_seconds: seconds, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);

    await logActivityRaw(
      sbAdmin,
      userId,
      "admin_set_slowmode",
      `Set chat slowmode to ${seconds} seconds`,
      null,
      { slowmode_seconds: seconds }
    );

    return { ok: true, slowmodeSeconds: seconds };
  });

// 11. Private Messaging: Fetch messages with a specific user
export const getPrivateMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ targetId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data: { targetId }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;

    const { data, error } = await supabase
      .from("private_messages")
      .select(`
        id,
        created_at,
        sender_id,
        receiver_id,
        content,
        is_read,
        sender:profiles!private_messages_sender_id_fkey (
          id,
          display_name,
          avatar_url,
          badges
        )
      `)
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${userId})`)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message.includes("does not exist")) return [];
      throw new Error(error.message);
    }

    // Mark messages sent by target user to us as read
    await supabase
      .from("private_messages")
      .update({ is_read: true })
      .eq("sender_id", targetId)
      .eq("receiver_id", userId)
      .eq("is_read", false);

    return data || [];
  });

// 12. Private Messaging: Send direct message to a user
export const sendPrivateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      receiverId: z.string().uuid(),
      content: z.string().min(1).max(1000)
    }).parse(input)
  )
  .handler(async ({ data: { receiverId, content }, context }) => {
    const supabase = context.supabase as any;
    const { userId } = context;
    const trimmed = content.trim();

    // Check ban/mute
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name, email, banned, muted_until")
      .eq("id", userId)
      .maybeSingle();

    if (senderProfile?.banned) throw new Error("Your account has been banned.");
    if (senderProfile?.muted_until && new Date(senderProfile.muted_until) > new Date()) {
      throw new Error(`You are muted until ${new Date(senderProfile.muted_until).toLocaleString()}`);
    }

    // Check blocks
    const { data: blockExists } = await supabase
      .from("blocked_users")
      .select("id")
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_id.eq.${userId})`)
      .maybeSingle();

    if (blockExists) {
      throw new Error("Cannot send private message. Block active between users.");
    }

    const profileForWarning = senderProfile || { display_name: null, email: "unknown@bloxsmith.pro" };

    // Filter profanity with ModBot tracking
    if (containsProfanity(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin, userId, profileForWarning,
        "dm_profanity", "inappropriate language is not allowed in direct messages."
      );
      throw new Error(errMsg);
    }

    // Caps-spam check
    if (isCapsSpam(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin, userId, profileForWarning,
        "dm_caps_spam", "stop typing in all caps in direct messages."
      );
      throw new Error(errMsg);
    }

    // Link-spam check
    if (isLinkSpam(trimmed)) {
      const sbAdmin = getAdminClient();
      const errMsg = await handleModBotWarning(
        sbAdmin, userId, profileForWarning,
        "dm_link_spam", "posting multiple links in direct messages is not allowed."
      );
      throw new Error(errMsg);
    }

    const { data, error } = await supabase
      .from("private_messages")
      .insert({
        sender_id: userId,
        receiver_id: receiverId,
        content: trimmed,
        is_read: false
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Log activity
    const sbAdmin = getAdminClient();
    await logActivityRaw(
      sbAdmin,
      userId,
      "send_private_message",
      `Sent private message to user ${receiverId}`,
      null,
      { receiverId }
    );

    return data;
  });

// 13. Private Messaging: Fetch active conversations
export const getPrivateConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: messages, error } = await (supabase as any)
      .from("private_messages")
      .select(`
        id,
        created_at,
        sender_id,
        receiver_id,
        content,
        is_read,
        sender:profiles!private_messages_sender_id_fkey (id, display_name, avatar_url, bio, badges),
        receiver:profiles!private_messages_receiver_id_fkey (id, display_name, avatar_url, bio, badges)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.message.includes("does not exist")) return [];
      throw new Error(error.message);
    }

    const conversationsMap = new Map<string, {
      partner: {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
        bio: string | null;
        badges: string[];
      };
      lastMessage: {
        content: string;
        created_at: string;
        sender_id: string;
      };
      unreadCount: number;
    }>();

    for (const rawMsg of (messages || [])) {
      const msg = rawMsg as any;
      const isSender = msg.sender_id === userId;
      const partnerData = isSender ? msg.receiver : msg.sender;
      if (!partnerData) continue;

      const partnerId = partnerData.id;

      let conv = conversationsMap.get(partnerId);
      if (!conv) {
        conv = {
          partner: {
            id: partnerId,
            display_name: partnerData.display_name,
            avatar_url: partnerData.avatar_url,
            bio: partnerData.bio,
            badges: partnerData.badges || [],
          },
          lastMessage: {
            content: msg.content,
            created_at: msg.created_at,
            sender_id: msg.sender_id,
          },
          unreadCount: 0
        };
        conversationsMap.set(partnerId, conv);
      }

      if (msg.receiver_id === userId && !msg.is_read) {
        conv.unreadCount += 1;
      }
    }

    return Array.from(conversationsMap.values());
  });

