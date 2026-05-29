import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Header, Footer } from "@/components/layout";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  Users,
  Search,
  Send,
  Loader2,
  AlertTriangle,
  Trash2,
  Flag,
  VolumeX,
  UserCheck,
  Heart,
  Ban,
  UserX,
  UserPlus,
  Crown,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import {
  getCommunityMessages,
  sendCommunityMessage,
  reportCommunityMessage,
  deleteCommunityMessage,
  searchUserProfiles,
  getChatSlowmode,
  setChatSlowmode,
  adminMuteUser,
  getPrivateMessages,
  sendPrivateMessage,
  getPrivateConversations,
} from "@/lib/social.functions";
import { ProfileCard, UserBadgesList, type ProfileData } from "@/components/ProfileCard";

export const Route = createFileRoute("/community")({
  component: CommunityPage,
  head: () => ({
    meta: [
      { title: "Community Hub — BloxSmith" },
      {
        name: "description",
        content: "Join the BloxSmith community chat! Connect with fellow builders, share your clothing designs, collaborate on projects, and grow your network.",
      },
    ],
  }),
});

type ChatMessage = {
  id: string;
  created_at: string;
  user_id: string;
  content: string;
  is_reported: boolean;
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string | null;
    badges: string[];
    banned?: boolean;
  };
};

function CommunityPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState<"chat" | "messages" | "social" | "directory">("chat");

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [lastSentTime, setLastSentTime] = useState(0);

  // Direct Messaging States
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<any | null>(null);
  const [privateMessages, setPrivateMessages] = useState<any[]>([]);
  const [loadingPrivateMessages, setLoadingPrivateMessages] = useState(false);
  const [privateDraft, setPrivateDraft] = useState("");
  const [sendingPrivate, setSendingPrivate] = useState(false);

  // Social / Friends states
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingIn, setPendingIn] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Selected ProfileCard state
  const [selectedProfile, setSelectedProfile] = useState<ProfileData | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  // Server functions
  const fetchMessages = useServerFn(getCommunityMessages);
  const sendMessage = useServerFn(sendCommunityMessage);
  const reportMessage = useServerFn(reportCommunityMessage);
  const deleteMessage = useServerFn(deleteCommunityMessage);
  const searchProfiles = useServerFn(searchUserProfiles);
  const fetchConversations = useServerFn(getPrivateConversations);
  const fetchPrivateMessages = useServerFn(getPrivateMessages);
  const sendPrivate = useServerFn(sendPrivateMessage);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: "auto" | "smooth" = "smooth") => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior });
    }, 80);
  };

  // Load chat
  const loadChat = async () => {
    try {
      const res = await fetchMessages();
      setMessages((res as unknown as ChatMessage[]) || []);
      scrollToBottom("auto");
    } catch (err) {
      console.error("Error loading chat messages:", err);
    } finally {
      setLoadingChat(false);
    }
  };

  // Load blocked list & social relations
  const loadSocialData = async () => {
    if (!user) return;
    setLoadingSocial(true);
    try {
      // 1. Fetch blocked users to filter messages in global chat
      const { data: blocks } = await (supabase as any)
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", user.id);
      setBlockedIds(((blocks as any) ?? []).map((b: any) => b.blocked_id));

      // 2. Fetch Mutual Friends (Accepted Requests)
      const { data: fr } = await (supabase as any)
        .from("friend_requests")
        .select(`
          sender:profiles!friend_requests_sender_id_fkey(id, display_name, email, avatar_url, bio, badges),
          receiver:profiles!friend_requests_receiver_id_fkey(id, display_name, email, avatar_url, bio, badges),
          status,
          sender_id,
          receiver_id
        `)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      const mutualFriends: any[] = [];
      const incomingRequests: any[] = [];

      (fr ?? []).forEach((row: any) => {
        if (row.status === "accepted") {
          const friend = row.sender_id === user.id ? row.receiver : row.sender;
          if (friend) mutualFriends.push(friend);
        } else if (row.status === "pending" && row.receiver_id === user.id) {
          if (row.sender) incomingRequests.push(row.sender);
        }
      });

      setFriends(mutualFriends);
      setPendingIn(incomingRequests);

      // 3. Fetch Follows & Followers
      const { data: fol } = await (supabase as any)
        .from("user_follows")
        .select("following_id, follower_id");

      const followingUserIds = (fol ?? []).filter((f: any) => f.follower_id === user.id).map((f: any) => f.following_id);
      const followerUserIds = (fol ?? []).filter((f: any) => f.following_id === user.id).map((f: any) => f.follower_id);

      if (followingUserIds.length > 0) {
        const { data: profilesFol } = await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_url, bio, badges")
          .in("id", followingUserIds);
        setFollowing(profilesFol ?? []);
      } else {
        setFollowing([]);
      }

      if (followerUserIds.length > 0) {
        const { data: profilesFers } = await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_url, bio, badges")
          .in("id", followerUserIds);
        setFollowers(profilesFers ?? []);
      } else {
        setFollowers([]);
      }
    } catch (err) {
      console.error("Error loading social relations:", err);
    } finally {
      setLoadingSocial(false);
    }
  };

  const loadConversations = async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setLoadingConversations(true);
    try {
      const res = await fetchConversations();
      setConversations(res || []);
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      if (showLoading) setLoadingConversations(false);
    }
  };

  const loadPrivateMessages = async (partnerId: string) => {
    setLoadingPrivateMessages(true);
    try {
      const res = await fetchPrivateMessages({ data: { targetId: partnerId } });
      setPrivateMessages(res || []);
      scrollToBottom("auto");
      loadConversations(false);
    } catch (err) {
      console.error("Error loading private messages:", err);
    } finally {
      setLoadingPrivateMessages(false);
    }
  };

  const handleSendPrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartner || !privateDraft.trim() || sendingPrivate) return;

    setSendingPrivate(true);
    const text = privateDraft.trim();
    setPrivateDraft("");

    try {
      await sendPrivate({ data: { receiverId: selectedPartner.id, content: text } });
      scrollToBottom("smooth");
    } catch (err: any) {
      toast.error(err.message || "Failed to send private message.");
    } finally {
      setSendingPrivate(false);
    }
  };

  const handleStartChat = (partnerId: string, displayName: string, avatarUrl: string | null) => {
    setSelectedPartner({
      id: partnerId,
      display_name: displayName,
      avatar_url: avatarUrl,
    });
    setActiveTab("messages");
    loadPrivateMessages(partnerId);
  };

  useEffect(() => {
    loadChat();
    loadSocialData();
    loadConversations();
  }, [user]);

  // Global Direct Messages notification subscriber
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("global_private_messages_notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages" },
        (payload) => {
          const newMsg = payload.new as any;
          if (newMsg.receiver_id === user.id) {
            loadConversations(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Direct Message active thread subscriber
  useEffect(() => {
    if (!user || activeTab !== "messages" || !selectedPartner) return;

    const channel = supabase
      .channel("active_private_thread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages" },
        async (payload) => {
          const newMsg = payload.new as any;
          const isThreadMessage =
            (newMsg.sender_id === user.id && newMsg.receiver_id === selectedPartner.id) ||
            (newMsg.sender_id === selectedPartner.id && newMsg.receiver_id === user.id);

          if (isThreadMessage) {
            // Hydrate sender details
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url, badges")
              .eq("id", newMsg.sender_id)
              .maybeSingle();

            const hydrated = {
              ...newMsg,
              sender: profile || {
                id: newMsg.sender_id,
                display_name: "Builder",
                avatar_url: null,
                badges: [],
              },
            };

            setPrivateMessages((prev) => {
              if (prev.some((m) => m.id === hydrated.id)) return prev;
              return [...prev, hydrated];
            });

            if (newMsg.receiver_id === user.id) {
              await (supabase as any)
                .from("private_messages")
                .update({ is_read: true })
                .eq("id", newMsg.id);
            }

            scrollToBottom("smooth");
          }
          loadConversations(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeTab, selectedPartner?.id]);

  // Real-time Chat Subscription & Presence Tracking
  useEffect(() => {
    const channel = supabase
      .channel("community_global_chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        async (payload) => {
          const newMsg = payload.new as any;
          // Hydrate user profile details for incoming message
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name, email, avatar_url, banner_url, bio, badges, banned")
            .eq("id", newMsg.user_id)
            .maybeSingle();

          if (profile) {
            const hydrated: ChatMessage = {
              ...newMsg,
              profiles: profile,
            };
            setMessages((prev) => {
              if (prev.some((m) => m.id === hydrated.id)) return prev;
              return [...prev, hydrated];
            });
            scrollToBottom("smooth");
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "community_messages" },
        (payload) => {
          const oldMsg = payload.old as any;
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .on("presence", { event: "sync" }, async () => {
        const state = channel.presenceState();
        const userIds: string[] = [];
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id && !p.user_id.startsWith("guest_") && !userIds.includes(p.user_id)) {
              userIds.push(p.user_id);
            }
          });
        });

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, badges")
            .in("id", userIds);
          setOnlineUsers(profiles || []);
        } else {
          setOnlineUsers([]);
        }

        const count = Object.keys(state).length;
        setOnlineCount(count > 0 ? count : 1);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (user) {
            await channel.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            });
          } else {
            await channel.track({
              user_id: "guest_" + Math.random().toString(36).substring(2, 9),
              online_at: new Date().toISOString(),
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Send Message function
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    if (!user) {
      return toast.error("Please sign in to participate in the community chat.");
    }

    // Spam filter: 2 seconds
    const now = Date.now();
    if (now - lastSentTime < 2000) {
      return toast.warning("Spam Protection: Please wait 2 seconds before sending another message.");
    }

    setSending(true);
    try {
      const result = await sendMessage({ data: { content: text } });
      setDraft("");
      setLastSentTime(now);

      // Show credit reward notification
      if (result?.creditAwarded) {
        toast.success(`🎉 +1 Credit earned! You've sent ${result.totalMessages} messages — keep chatting!`, {
          duration: 5000,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to deliver message.");
    } finally {
      setSending(false);
    }
  };

  // Report message
  const handleReport = async (msgId: string) => {
    const reason = window.prompt("Reason for reporting this message:", "Inappropriate language / spam");
    if (!reason || !reason.trim()) return;

    try {
      const res = await reportMessage({ data: { messageId: msgId, reason: reason.trim() } });
      if (res.alreadyReported) {
        toast.info("You have already reported this message.");
      } else {
        toast.success("Thank you for your report. Our moderators will review it.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send report.");
    }
  };

  // Delete message
  const handleDelete = async (msgId: string) => {
    if (!confirm("Are you sure you want to delete this message? This cannot be undone.")) return;

    try {
      await deleteMessage({ data: { messageId: msgId } });
      toast.success("Message deleted successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete message.");
    }
  };

  const muteAuthor = useServerFn(adminMuteUser);
  const handleMute = async (authorId: string, authorName: string) => {
    const hoursStr = window.prompt(
      `Mute ${authorName} from chat.\nEnter hours to mute (0 to unmute, e.g. 1, 24):`,
      "1",
    );
    if (hoursStr === null) return;
    const hours = parseInt(hoursStr, 10);
    if (Number.isNaN(hours) || hours < 0) return toast.error("Enter a valid number of hours.");
    try {
      await muteAuthor({ data: { targetId: authorId, hours } });
      toast.success(hours === 0 ? `${authorName} unmuted.` : `${authorName} muted for ${hours}h.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to mute user.");
    }
  };

  // Search profiles
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return toast.info("Please enter at least 2 characters.");

    setSearching(true);
    try {
      const res = await searchProfiles({ data: { query: searchQuery.trim() } });
      setSearchResults(res || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to search profiles.");
    } finally {
      setSearching(false);
    }
  };

  // Check if current user is admin/staff
  const [isStaffMember, setIsStaffMember] = useState(false);
  const [slowmodeSeconds, setSlowmodeSeconds] = useState(2);
  const fetchSlowmode = useServerFn(getChatSlowmode);
  const saveSlowmode = useServerFn(setChatSlowmode);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchSlowmode({});
        if (res && typeof res.slowmodeSeconds === "number") setSlowmodeSeconds(res.slowmodeSeconds);
      } catch {
        /* default stays */
      }
    })();
  }, []);

  const handleSetSlowmode = async (seconds: number) => {
    try {
      await saveSlowmode({ data: { seconds } });
      setSlowmodeSeconds(seconds);
      toast.success(seconds === 0 ? "Slowmode turned off." : `Slowmode set to ${seconds}s.`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update slowmode.");
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("badges")
        .eq("id", user.id)
        .maybeSingle();
      const userBadges = profile?.badges || [];
      setIsStaffMember(
        userBadges.includes("owner") ||
        userBadges.includes("staff") ||
        userBadges.includes("admin")
      );
    })();
  }, [user]);

  // Filter out blocked users
  const filteredMessages = messages.filter((m) => !blockedIds.includes(m.profiles?.id));

  // Direct message unread count
  const totalUnread = conversations.reduce((acc, conv) => acc + (conv.unreadCount || 0), 0);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/30">
      <Header />

      <main className="flex-1 relative pb-20">
        {/* Glow backdrop decorative elements */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[450px] w-[min(100vw,800px)] rounded-full bg-gradient-radial from-primary/10 to-transparent pointer-events-none filter blur-3xl" />
        <div className="absolute top-0 right-1/4 h-[300px] w-[300px] rounded-full bg-primary-glow/5 pointer-events-none filter blur-2xl" />

        <div className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          {/* Header intro */}
          <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/40 pb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary mb-2 shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]">
                💬 Bloxsmith Community
              </span>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-muted-foreground">
                Creators Hub
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-xl">
                Share building insights, showcase dynamic models, find script collaborators, and socialize with developers.
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex p-1 rounded-xl bg-surface/50 border border-border/50 backdrop-blur-md">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "chat"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4" /> Global Chat
              </button>

              {user && (
                <button
                  onClick={() => {
                    setActiveTab("messages");
                    loadConversations();
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all relative ${
                    activeTab === "messages"
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Mail className="h-4 w-4" /> Direct Messages
                  {totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-bounce shadow-md">
                      {totalUnread}
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  setActiveTab("social");
                  loadSocialData();
                }}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "social"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-4 w-4" /> Friends & Social
              </button>

              <button
                onClick={() => setActiveTab("directory")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "directory"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Search className="h-4 w-4" /> Directory
              </button>
            </div>
          </div>

          {/* TAB CONTENT: GLOBAL CHAT */}
          {activeTab === "chat" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[660px] max-h-[72dvh]">
              {/* Main Chat Box */}
              <div className="lg:col-span-3 flex flex-col h-full bg-surface-elevated/40 border border-border/80 rounded-2xl overflow-hidden backdrop-blur-xl shadow-xl">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-border/80 bg-surface-elevated/40 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                    <span className="text-xs font-bold text-foreground">Global Chatroom</span>
                    <span className="ml-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      {onlineCount} {onlineCount === 1 ? 'user' : 'users'} online
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {slowmodeSeconds > 0 && (
                      <span
                        className="text-[10px] text-amber-400/90 font-semibold flex items-center gap-1"
                        title={`Slowmode: ${slowmodeSeconds}s between messages`}
                      >
                        🐢 {slowmodeSeconds}s
                      </span>
                    )}
                    {isStaffMember && (
                      <select
                        value={slowmodeSeconds}
                        onChange={(e) => handleSetSlowmode(parseInt(e.target.value, 10))}
                        title="Set slowmode (owner/admin only)"
                        className="rounded-lg bg-surface border border-border px-2 py-1 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value={0}>Slowmode: Off</option>
                        <option value={2}>2s</option>
                        <option value={5}>5s</option>
                        <option value={10}>10s</option>
                        <option value={30}>30s</option>
                        <option value={60}>1 min</option>
                        <option value={300}>5 min</option>
                      </select>
                    )}
                    <span className="text-[10px] text-muted-foreground">Real-time Feed</span>
                  </div>
                </div>

                {/* Messages feed */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {loadingChat ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                      <p className="text-xs">Loading community room messages...</p>
                    </div>
                  ) : filteredMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                      <MessageSquare className="h-10 w-10 text-border mb-3" />
                      <p className="text-xs">No community messages yet. Be the first to start the talk!</p>
                    </div>
                  ) : (
                    filteredMessages.map((m) => {
                      const mine = m.user_id === user?.id;
                      const author = m.profiles || {};
                      const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${author.id}`;

                      return (
                        <div key={m.id} className="group flex gap-3 items-start animate-fade-in">
                          {/* Avatar trigger profile card */}
                          <button
                            onClick={() => setSelectedProfile(author as any)}
                            className="shrink-0 relative rounded-xl border border-border/60 overflow-hidden h-10 w-10 bg-surface shadow-sm hover:border-primary/50 transition duration-200"
                          >
                            <img src={author.avatar_url || fallbackAvatar} alt="avatar" className="h-full w-full object-cover" />
                          </button>

                          {/* Message Content Bubble */}
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <button
                                onClick={() => setSelectedProfile(author as any)}
                                className={`text-xs font-black transition duration-150 flex items-center gap-1 ${
                                  author.badges?.includes("owner")
                                    ? "text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.4)] hover:text-red-300"
                                    : author.badges?.includes("staff")
                                    ? "text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.4)] hover:text-violet-300"
                                    : author.badges?.includes("premium_3")
                                    ? "text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)] hover:text-amber-300"
                                    : author.badges?.includes("premium_2")
                                    ? "text-cyan-400 hover:text-cyan-300"
                                    : author.badges?.includes("famous")
                                    ? "text-emerald-400 hover:text-emerald-300"
                                    : author.badges?.includes("tester")
                                    ? "text-sky-400 drop-shadow-[0_0_5px_rgba(14,165,233,0.3)] hover:text-sky-300"
                                    : "text-foreground hover:text-primary"
                                }`}
                              >
                                {author.badges?.includes("owner") && (
                                  <Crown className="h-3.5 w-3.5 text-red-400 animate-pulse shrink-0 fill-red-400/20" />
                                )}
                                {author.display_name || "Builder"}
                              </button>
                              <UserBadgesList badges={author.badges} />
                              <span className="text-[10px] text-muted-foreground/60 ml-auto" title={new Date(m.created_at).toLocaleString()}>
                                {(() => {
                                  const msgDate = new Date(m.created_at);
                                  const now = new Date();
                                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                  const yesterday = new Date(today.getTime() - 86400000);
                                  const time = msgDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                  if (msgDate >= today) return `Today ${time}`;
                                  if (msgDate >= yesterday) return `Yesterday ${time}`;
                                  return `${msgDate.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
                                })()}
                              </span>
                            </div>

                            <div className="rounded-xl px-4 py-2.5 text-xs text-foreground bg-surface/40 border border-border/30 shadow-[0_2px_8px_rgba(0,0,0,0.1)] leading-relaxed break-words hover:border-border/60 transition group-hover:shadow-md">
                              {m.content}
                            </div>
                          </div>

                          {/* Actions on hover */}
                          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 self-center">
                            {user && !mine && (
                              <button
                                onClick={() => handleReport(m.id)}
                                title="Report message"
                                className="h-7 w-7 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-muted-foreground/60 border border-transparent hover:border-red-500/20 grid place-items-center transition"
                              >
                                <Flag className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {isStaffMember && !mine && author.id && (
                              <button
                                onClick={() => handleMute(author.id, author.display_name || "user")}
                                title="Mute this user from chat"
                                className="h-7 w-7 rounded-lg hover:bg-amber-500/10 hover:text-amber-400 text-muted-foreground/60 border border-transparent hover:border-amber-500/20 grid place-items-center transition"
                              >
                                <VolumeX className="h-3.5 w-3.5" />
                              </button>
                            )}

                            {(isStaffMember || mine) && (
                              <button
                                onClick={() => handleDelete(m.id)}
                                title="Delete message"
                                className="h-7 w-7 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-muted-foreground/60 border border-transparent hover:border-red-500/20 grid place-items-center transition"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Message input / Guest banner */}
                <div className="shrink-0 p-4 border-t border-border/80 bg-surface-elevated/20 backdrop-blur-md">
                  {authLoading ? (
                    <div className="h-12 flex items-center justify-center text-muted-foreground text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                      Loading account permissions...
                    </div>
                  ) : user ? (
                    <div className="space-y-1.5 flex-1">
                      <form onSubmit={handleSend} className="flex gap-2">
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Share your latest Roblox creation or say hi..."
                          maxLength={1000}
                          className="flex-1 min-w-0 rounded-xl bg-surface/60 border border-border px-4 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition shadow-inner placeholder:text-muted-foreground/50"
                        />
                        <button
                          type="submit"
                          disabled={sending || !draft.trim()}
                          className="rounded-xl bg-primary px-4 hover:bg-primary/90 text-primary-foreground text-xs font-bold transition shadow-md hover:shadow-lg disabled:opacity-50 active:scale-[0.97] grid place-items-center h-10 w-12"
                        >
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                      </form>
                      <p className="text-[10px] text-muted-foreground/80 px-1">
                        💬 Earn <span className="text-primary-glow font-semibold">1 free credit</span> for every 10 messages you send in chat!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-md shadow-lg">
                      <div className="text-center sm:text-left">
                        <h4 className="text-xs font-bold text-primary">Join the Conversation</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Sign in to chat with other creators, share clothing textures, and find builders.
                        </p>
                      </div>
                      <Link
                        to="/login"
                        className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold transition shadow-md hover:shadow-lg active:scale-95"
                      >
                        Log In / Sign Up
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Online Hub & Quick rules */}
              <div className="hidden lg:flex flex-col gap-5 h-full">
                {/* Active Chatters Panel */}
                <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col max-h-[220px]">
                  <h3 className="text-xs font-bold text-foreground mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Active Creators
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">{onlineCount} online</span>
                  </h3>
                  <div className="overflow-y-auto space-y-1 flex-1 pr-1">
                    {onlineUsers.length === 0 ? (
                      <div className="text-[10px] text-muted-foreground/80 italic py-2 text-center">
                        Only guest builders online currently.
                      </div>
                    ) : (
                      onlineUsers.map((u) => {
                        const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${u.id}`;
                        const isOwner = u.badges?.includes("owner");
                        const isStaff = u.badges?.includes("staff");
                        return (
                          <button
                            key={u.id}
                            onClick={() => setSelectedProfile(u)}
                            className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface/50 transition text-left group"
                          >
                            <div className="relative h-6 w-6 rounded-md overflow-hidden border border-border/60 shrink-0">
                              <img src={u.avatar_url || fallbackAvatar} alt="avatar" className="h-full w-full object-cover" />
                              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-emerald-500 border border-surface shadow-[0_0_4px_#10b981]" />
                            </div>
                            <span className={`text-[11px] font-bold truncate flex-1 flex items-center gap-1 group-hover:text-primary transition ${
                              isOwner
                                ? "text-red-400 font-extrabold"
                                : isStaff
                                ? "text-violet-400 font-extrabold"
                                : "text-foreground"
                            }`}>
                              {isOwner && <Crown className="h-3 w-3 text-red-400 animate-pulse shrink-0 fill-red-400/20" />}
                              {u.display_name || "Builder"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Chatroom Guidelines */}
                <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl">
                  <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                    🛡️ Chatroom Guidelines
                  </h3>
                  <ul className="space-y-2 text-[10px] text-muted-foreground leading-relaxed">
                    <li className="flex items-start gap-1">
                      <span className="text-primary font-bold">1.</span> Be respectful to all fellow creators and builders.
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-primary font-bold">2.</span> Keep self-promotions focused on Roblox design/dev work.
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-primary font-bold">3.</span> No spamming, flooding, or offensive content.
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-primary font-bold">4.</span> Follow terms of service. Use reporting wisely.
                    </li>
                  </ul>
                </div>

                {/* Promo Card */}
                <div className="flex-1 p-5 rounded-2xl bg-gradient-brand border border-white/5 relative overflow-hidden shadow-xl flex flex-col justify-end">
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="relative z-10 space-y-2">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/20 text-white uppercase tracking-wider">
                      Premium Benefits
                    </span>
                    <h4 className="text-sm font-black text-white leading-tight">
                      Upgrade to Premium
                    </h4>
                    <p className="text-[10px] text-gray-200/90 leading-relaxed">
                      Unlock stunning profile badges, raise your credits, get 3D model search privileges, and stand out in the chat feed!
                    </p>
                    <Link
                      to="/pricing"
                      className="inline-flex w-full items-center justify-center py-2 rounded-xl bg-white hover:bg-gray-100 text-black text-xs font-bold transition shadow-md"
                    >
                      Explore Tiers
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DIRECT MESSAGES */}
          {activeTab === "messages" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[660px] max-h-[72dvh] animate-fade-in mb-8">
              {/* Conversations Sidebar (1 column) */}
              <div className="lg:col-span-1 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col overflow-hidden h-full">
                <div className="p-4 border-b border-border/40 bg-surface/20 flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-primary" /> Threads
                  </h3>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    {conversations.length} active
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {loadingConversations ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="text-center py-10 px-4">
                      <p className="text-[10px] text-muted-foreground">No active direct message threads yet.</p>
                      <p className="text-[9px] text-muted-foreground/60 mt-1">Open a profile and click "Message User" to start chatting!</p>
                    </div>
                  ) : (
                    conversations.map((conv) => {
                      const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.partner.id}`;
                      const isSelected = selectedPartner?.id === conv.partner.id;

                      return (
                        <button
                          key={conv.partner.id}
                          onClick={() => {
                            setSelectedPartner(conv.partner);
                            loadPrivateMessages(conv.partner.id);
                          }}
                          className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition ${
                            isSelected
                              ? "bg-primary/20 border border-primary/30 text-foreground"
                              : "hover:bg-surface/50 border border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 border border-border/60 relative">
                            <img
                              src={conv.partner.avatar_url || fallbackAvatar}
                              alt="avatar"
                              className="h-full w-full object-cover"
                            />
                            {conv.unreadCount > 0 && (
                              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold h-3.5 w-3.5 rounded-full flex items-center justify-center shadow-sm">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className="text-[11px] font-black text-foreground truncate">
                                {conv.partner.display_name || "Builder"}
                              </span>
                              <span className="text-[8px] text-muted-foreground">
                                {new Date(conv.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[10px] truncate text-muted-foreground/80">
                              {conv.lastMessage.sender_id === user?.id ? "You: " : ""}{conv.lastMessage.content}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Chat Thread Panel (3 columns) */}
              <div className="lg:col-span-3 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col overflow-hidden h-full">
                {selectedPartner ? (
                  <>
                    {/* Header */}
                    <div className="p-4 border-b border-border/40 bg-surface/20 flex items-center justify-between">
                      <button
                        onClick={() => setSelectedProfile(selectedPartner)}
                        className="flex items-center gap-2.5 text-left group"
                      >
                        <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 border border-border/60">
                          <img
                            src={selectedPartner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedPartner.id}`}
                            alt="avatar"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-foreground group-hover:text-primary transition flex items-center gap-1">
                            {selectedPartner.display_name || "Builder"}
                            <UserBadgesList badges={selectedPartner.badges || []} />
                          </h3>
                          <p className="text-[9px] text-muted-foreground/80 truncate max-w-[200px] italic">
                            {selectedPartner.bio || "Active Bloxsmith builder"}
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {loadingPrivateMessages ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : privateMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                          <Mail className="h-10 w-10 text-border mb-2" />
                          <p className="text-xs font-bold">This is the beginning of your private thread.</p>
                          <p className="text-[10px] text-muted-foreground/60">Say hello to {selectedPartner.display_name || "Builder"}!</p>
                        </div>
                      ) : (
                        privateMessages.map((m) => {
                          const isMine = m.sender_id === user?.id;
                          const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${m.sender_id}`;

                          return (
                            <div
                              key={m.id}
                              className={`flex gap-3 items-start animate-fade-in ${
                                isMine ? "flex-row-reverse" : ""
                              }`}
                            >
                              {/* Avatar */}
                              <button
                                onClick={() => setSelectedProfile(m.sender || selectedPartner)}
                                className="shrink-0 relative rounded-lg border border-border/60 overflow-hidden h-8 w-8 bg-surface shadow-sm"
                              >
                                <img
                                  src={m.sender?.avatar_url || (isMine ? user?.user_metadata?.avatar_url : selectedPartner.avatar_url) || fallbackAvatar}
                                  alt="avatar"
                                  className="h-full w-full object-cover"
                                />
                              </button>

                              {/* Message bubble */}
                              <div className={`max-w-[70%] ${isMine ? "text-right" : "text-left"}`}>
                                <div
                                  className={`rounded-2xl px-4 py-2.5 text-xs shadow-sm border ${
                                    isMine
                                      ? "bg-primary text-primary-foreground border-primary/30 rounded-tr-none"
                                      : "bg-surface-elevated/85 text-foreground border-border rounded-tl-none"
                                  }`}
                                >
                                  <p className="leading-relaxed break-words whitespace-pre-wrap">{m.content}</p>
                                </div>
                                <span className="text-[8px] text-muted-foreground/60 mt-1 block px-1">
                                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input Form */}
                    <form onSubmit={handleSendPrivate} className="p-4 border-t border-border/40 bg-surface/20 flex gap-2">
                      <input
                        type="text"
                        value={privateDraft}
                        onChange={(e) => setPrivateDraft(e.target.value)}
                        placeholder={`Message @${selectedPartner.display_name || "Builder"}...`}
                        disabled={sendingPrivate}
                        className="flex-1 rounded-xl bg-surface/60 border border-border/60 hover:border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 text-xs px-4 py-2.5 outline-none transition placeholder:text-muted-foreground/60 text-foreground"
                      />
                      <button
                        type="submit"
                        disabled={!privateDraft.trim() || sendingPrivate}
                        className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 shrink-0 shadow-sm"
                      >
                        {sendingPrivate ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                    <Mail className="h-12 w-12 text-border mb-3 animate-pulse" />
                    <h3 className="text-xs font-bold text-foreground">Select a Chat Thread</h3>
                    <p className="text-[10px] text-muted-foreground/60 max-w-xs mt-1">
                      Choose an active conversation from the sidebar, or view a builder's profile from Global Chat or Directory to start a new private message thread.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: FRIENDS & SOCIAL */}
          {activeTab === "social" && (
            <div className="min-h-[500px]">
              {loadingSocial ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-xs">Loading social lists...</p>
                </div>
              ) : !user ? (
                <div className="py-16 text-center max-w-md mx-auto rounded-2xl bg-surface-elevated/40 border border-border/80 p-8 backdrop-blur-xl">
                  <AlertTriangle className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-foreground">Sign In Required</h3>
                  <p className="text-xs text-muted-foreground mt-2 mb-4 leading-relaxed">
                    Social features like adding friends, following top builders, and seeing followers are exclusive to registered accounts.
                  </p>
                  <Link
                    to="/login"
                    className="inline-block px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition shadow-md active:scale-95"
                  >
                    Get Started
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Column 1: Incoming requests */}
                  <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col h-[520px]">
                    <h3 className="text-xs font-extrabold text-foreground border-b border-border/40 pb-2 mb-3 flex items-center justify-between">
                      <span>📩 Incoming Requests</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px]">
                        {pendingIn.length}
                      </span>
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {pendingIn.length === 0 ? (
                        <p className="text-center text-[10px] text-muted-foreground py-8">
                          No pending requests.
                        </p>
                      ) : (
                        pendingIn.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2.5 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-border/60 transition"
                          >
                            <button
                              onClick={() => setSelectedProfile(p as any)}
                              className="h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-border/60"
                            >
                              <img
                                src={p.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`}
                                alt="avatar"
                                className="h-full w-full object-cover"
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <button
                                onClick={() => setSelectedProfile(p as any)}
                                className="text-[11px] font-extrabold text-foreground truncate hover:text-primary transition block text-left"
                              >
                                {p.display_name || "Builder"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 2: Mutual Friends */}
                  <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col h-[520px]">
                    <h3 className="text-xs font-extrabold text-foreground border-b border-border/40 pb-2 mb-3 flex items-center justify-between">
                      <span>👥 My Friends</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px]">
                        {friends.length}
                      </span>
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {friends.length === 0 ? (
                        <p className="text-center text-[10px] text-muted-foreground py-8">
                          Add friends to grow your Roblox design team!
                        </p>
                      ) : (
                        friends.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedProfile(f as any)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-border/60 hover:bg-surface/50 text-left transition"
                          >
                            <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-border/60">
                              <img
                                src={f.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${f.id}`}
                                alt="avatar"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-extrabold text-foreground truncate">
                                {f.display_name || "Builder"}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 3: Following */}
                  <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col h-[520px]">
                    <h3 className="text-xs font-extrabold text-foreground border-b border-border/40 pb-2 mb-3 flex items-center justify-between">
                      <span>💖 Following</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px]">
                        {following.length}
                      </span>
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {following.length === 0 ? (
                        <p className="text-center text-[10px] text-muted-foreground py-8">
                          No follows yet.
                        </p>
                      ) : (
                        following.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedProfile(f as any)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-border/60 hover:bg-surface/50 text-left transition"
                          >
                            <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-border/60">
                              <img
                                src={f.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${f.id}`}
                                alt="avatar"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-extrabold text-foreground truncate">
                                {f.display_name || "Builder"}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 4: Followers */}
                  <div className="p-4 rounded-2xl bg-surface-elevated/40 border border-border/80 shadow-md backdrop-blur-xl flex flex-col h-[520px]">
                    <h3 className="text-xs font-extrabold text-foreground border-b border-border/40 pb-2 mb-3 flex items-center justify-between">
                      <span>🔔 Followers</span>
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px]">
                        {followers.length}
                      </span>
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-2">
                      {followers.length === 0 ? (
                        <p className="text-center text-[10px] text-muted-foreground py-8">
                          You don't have any followers yet. Publish clothing, remixes, or help people in chat!
                        </p>
                      ) : (
                        followers.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedProfile(f as any)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-border/60 hover:bg-surface/50 text-left transition"
                          >
                            <div className="h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-border/60">
                              <img
                                src={f.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${f.id}`}
                                alt="avatar"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-extrabold text-foreground truncate">
                                {f.display_name || "Builder"}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: DIRECTORY SEARCH */}
          {activeTab === "directory" && (
            <div className="min-h-[500px] space-y-6 animate-fade-in">
              <div className="p-5 rounded-2xl bg-surface-elevated/40 border border-border/80 backdrop-blur-xl shadow-md">
                <h3 className="text-xs font-bold text-foreground mb-4">
                  🔍 Search Creator Profiles
                </h3>
                <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by display name or email..."
                    className="flex-1 min-w-0 rounded-xl bg-surface/60 border border-border px-4 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50 transition placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="submit"
                    disabled={searching || searchQuery.trim().length < 2}
                    className="inline-flex items-center gap-1.5 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition shadow-md active:scale-95 disabled:opacity-50 h-10 shrink-0"
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search
                  </button>
                </form>
              </div>

              {/* Grid of Results */}
              {searching ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-xs">Searching user records...</p>
                </div>
              ) : searchResults.length === 0 ? (
                searchQuery.trim().length >= 2 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <Search className="h-10 w-10 text-border mx-auto mb-3" />
                    <p className="text-xs">No matching builders found for your search query.</p>
                  </div>
                ) : (
                  <div className="py-16 text-center text-muted-foreground">
                    <Search className="h-10 w-10 text-border mx-auto mb-3" />
                    <p className="text-xs">Type a builder's name above to explore their profile.</p>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {searchResults.map((p) => {
                    const fallbackAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${p.id}`;

                    return (
                      <div
                        key={p.id}
                        className="group relative rounded-2xl bg-surface-elevated/40 border border-border/80 hover:border-primary/30 p-4 transition shadow-sm hover:shadow-md flex flex-col justify-between"
                      >
                        <div className="flex gap-3 items-start">
                          <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 border border-border/60 shadow-sm bg-surface">
                            <img src={p.avatar_url || fallbackAvatar} alt="avatar" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-extrabold text-foreground truncate">
                              {p.display_name || "Builder"}
                            </h4>
                            <div className="pt-1.5">
                              <UserBadgesList badges={p.badges} />
                            </div>
                          </div>
                        </div>

                        <p className="text-[10px] text-muted-foreground line-clamp-2 italic leading-relaxed mt-3 border-t border-border/30 pt-2.5">
                          {p.bio || "No profile bio written yet."}
                        </p>

                        <button
                          onClick={() => setSelectedProfile(p as any)}
                          className="mt-4 w-full py-2 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 text-foreground hover:text-primary text-[10px] font-bold transition flex items-center justify-center gap-1.5"
                        >
                          View Profile Hub
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating selected ProfileCard rendering */}
        {selectedProfile && (
          <ProfileCard
            profile={selectedProfile}
            onClose={() => setSelectedProfile(null)}
            isStaff={isStaffMember}
            onStartChat={handleStartChat}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
