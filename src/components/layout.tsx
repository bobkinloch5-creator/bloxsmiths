import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { createRobloxStyleAvatar } from "@/lib/generated-avatar";
import logo from "@/assets/logo.png";
import { useState, useEffect } from "react";
import {
  User,
  Settings,
  CreditCard,
  LogOut,
  ChevronDown,
  Home,
  LayoutDashboard,
  Puzzle,
  BookOpen,
  Sparkles,
  BadgeDollarSign,
  MessageCircle,
  Box,
  Shirt,
  Menu,
  Globe,
  FileCode,
  Clock,
} from "lucide-react";
import { PluginStatus } from "@/components/PluginStatus";
import { McpStatus } from "@/components/McpStatus";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = {
  to: string;
  label: string;
  icon?: typeof Home;
  authOnly?: boolean;
  guestOnly?: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", authOnly: true },
  { to: "/templates", label: "Templates" },
  { to: "/clothing", label: "Clothing" },
  { to: "/image-generator", label: "Images" },
  { to: "/showcase", label: "Showcase" },
  { to: "/community", label: "Community" },
  { to: "/ideas", label: "Ideas" },
  { to: "/pricing", label: "Pricing" },
  { to: "/docs", label: "Docs" },
  { to: "/changelog", label: "Changelog" },
  { to: "/plugin", label: "Plugin" },
  { to: "/mcp", label: "MCP" },
  { to: "/mcp-servers", label: "MCP Servers", authOnly: true },
  { to: "/faq", label: "FAQ" },
];

const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/dashboard", label: "Build", icon: LayoutDashboard, authOnly: true },
  { to: "/account", label: "Profile", icon: User, authOnly: true },
  { to: "/clothing", label: "Clothing", icon: Shirt },
  { to: "/login", label: "Login", icon: User, guestOnly: true },
  { to: "/plugin", label: "Plugin", icon: Puzzle },
  { to: "/pricing", label: "Credits", icon: BadgeDollarSign },
  { to: "/templates", label: "Templates", icon: Sparkles },
  { to: "/docs", label: "Docs", icon: BookOpen },
  { to: "/ideas", label: "Ideas", icon: Sparkles },
  { to: "/community", label: "Community", icon: MessageCircle },
  { to: "/mcp", label: "MCP", icon: Box },
  { to: "/faq", label: "FAQ", icon: MessageCircle },
];

function ProfileAvatar({
  src,
  fallback,
  size = "sm",
}: {
  src?: string | null;
  fallback: string;
  size?: "sm" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-14 w-14" : "h-6 w-6";
  return (
    <span
      className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 ring-1 ring-primary/20`}
    >
      <img src={src || fallback} alt="Profile avatar" className="h-full w-full object-cover" />
    </span>
  );
}

export function Header() {
  const { user, signOut, profile } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  // Universal UTC Clock
  const [utcTime, setUtcTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtcTime(now.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedCredits = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(profile?.credits ?? 0);

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
  const bannerUrl = profile?.banner_url || user?.user_metadata?.banner_url || null;
  const fallbackAvatar = createRobloxStyleAvatar(user?.id || user?.email);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.authOnly || user);
  const mobileItems = MOBILE_NAV_ITEMS.filter((item) => {
    if (item.authOnly && !user) return false;
    if (item.guestOnly && user) return false;
    return true;
  });

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 shrink-0 notranslate"
          translate="no"
        >
          <img
            src={logo}
            alt="BloxSmith logo"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-md"
          />
          <span className="truncate text-base sm:text-lg font-bold whitespace-nowrap">
            Blox<span className="gradient-text">Smith</span>
          </span>
          <span className="ml-1 hidden lg:inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/20">
            Beta
          </span>
        </Link>

        <div className="hidden md:block relative flex-1 max-w-xs pl-4">
          <button
            onClick={() => setExploreOpen(!exploreOpen)}
            className="flex items-center gap-1.5 rounded-full border border-border/80 bg-surface-elevated/45 hover:bg-surface px-4 py-1.5 text-xs font-semibold text-foreground/90 transition shadow-sm hover:border-primary/30"
            type="button"
          >
            <Menu className="h-3.5 w-3.5 text-primary" />
            Explore Menu
            <ChevronDown
              className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                exploreOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {exploreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExploreOpen(false)} />
              <div className="absolute left-0 top-full mt-2 w-[480px] z-50 rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-border shadow-2xl p-4 grid grid-cols-2 gap-4 animate-fade-in">
                {/* Column 1: Creation & Tools */}
                <div className="space-y-3">
                  <h3 className="text-[10px] uppercase tracking-wider font-bold text-primary-glow px-2">
                    Create & Explore
                  </h3>
                  <div className="space-y-0.5">
                    <Link
                      to="/templates"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Game Templates</div>
                        <div className="text-[10px] text-muted-foreground">Ready-to-use Roblox starters</div>
                      </div>
                    </Link>
                    <Link
                      to="/clothing"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Shirt className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Clothing Studio</div>
                        <div className="text-[10px] text-muted-foreground">Design Roblox shirts & pants</div>
                      </div>
                    </Link>
                    <Link
                      to="/image-generator"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Image Generator</div>
                        <div className="text-[10px] text-muted-foreground">Generate textures & assets</div>
                      </div>
                    </Link>
                    <Link
                      to="/ideas"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Game Ideas</div>
                        <div className="text-[10px] text-muted-foreground">AI-generated game concepts</div>
                      </div>
                    </Link>
                    <Link
                      to="/showcase"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Showcase</div>
                        <div className="text-[10px] text-muted-foreground">See what others are building</div>
                      </div>
                    </Link>
                    <Link
                      to="/community"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Community Hub</div>
                        <div className="text-[10px] text-muted-foreground">Chat, friends, and social hub</div>
                      </div>
                    </Link>
                  </div>
                </div>

                {/* Column 2: Resources & Setup */}
                <div className="space-y-3">
                  <h3 className="text-[10px] uppercase tracking-wider font-bold text-primary-glow px-2">
                    Resources & Setup
                  </h3>
                  <div className="space-y-0.5">
                    <Link
                      to="/pricing"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <BadgeDollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Pricing</div>
                        <div className="text-[10px] text-muted-foreground">Get credits to build faster</div>
                      </div>
                    </Link>
                    <Link
                      to="/plugin"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Puzzle className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Studio Plugin</div>
                        <div className="text-[10px] text-muted-foreground">Download the Roblox plugin</div>
                      </div>
                    </Link>
                    <a
                      href="https://kingdavez.click"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-1">
                          3D Models <span className="text-[9px] text-muted-foreground font-normal">(external)</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">Browse premium 3D assets</div>
                      </div>
                    </a>
                    <Link
                      to="/docs"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Documentation</div>
                        <div className="text-[10px] text-muted-foreground">Learn how to use BloxSmith</div>
                      </div>
                    </Link>
                    <Link
                      to="/changelog"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <FileCode className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">Changelog</div>
                        <div className="text-[10px] text-muted-foreground">Bugs fixes and platform updates</div>
                      </div>
                    </Link>
                    <Link
                      to="/mcp"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <Box className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">MCP Connect</div>
                        <div className="text-[10px] text-muted-foreground">Connect external AI clients</div>
                      </div>
                    </Link>
                    <Link
                      to="/faq"
                      onClick={() => setExploreOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <div className="font-semibold text-foreground">FAQ & Support</div>
                        <div className="text-[10px] text-muted-foreground">Get help and answers</div>
                      </div>
                    </Link>
                    {user && (
                      <Link
                        to="/dashboard"
                        onClick={() => setExploreOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-xs text-foreground/90 hover:bg-surface hover:text-foreground transition"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground">Dashboard</div>
                          <div className="text-[10px] text-muted-foreground">Manage your projects</div>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:gap-2.5">
          <div className="hidden md:flex shrink-0 items-center gap-2">
            <a
              href="https://discord.gg/J9TU7syJCr"
              target="_blank"
              rel="noopener noreferrer"
              title="Join the BloxSmith Discord — +5 free credits"
              className="hidden 2xl:inline-flex h-9 items-center gap-1.5 rounded-full bg-[#5865F2]/15 hover:bg-[#5865F2]/25 border border-[#5865F2]/30 px-3 text-xs font-semibold text-[#8ea0ff] transition whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.18.327-.39.766-.535 1.117a18.27 18.27 0 0 0-5.487 0C10.39 3.766 10.175 3.327 9.992 3a19.736 19.736 0 0 0-3.76 1.369C2.4 9.97 1.36 15.42 1.87 20.785a19.9 19.9 0 0 0 5.99 3.03c.484-.66.917-1.363 1.29-2.104-.71-.27-1.39-.6-2.03-.99.17-.124.336-.253.495-.386 3.93 1.83 8.18 1.83 12.06 0 .161.133.327.262.495.386-.643.39-1.324.72-2.034.99.374.74.806 1.443 1.29 2.103a19.852 19.852 0 0 0 5.992-3.03c.6-6.225-1.05-11.625-4.31-16.415zM8.02 17.045c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.953-2.42 2.157-2.42 1.21 0 2.176 1.094 2.157 2.42 0 1.335-.953 2.42-2.157 2.42zm7.96 0c-1.184 0-2.157-1.085-2.157-2.42 0-1.333.952-2.42 2.157-2.42 1.21 0 2.176 1.094 2.156 2.42 0 1.335-.946 2.42-2.156 2.42z" />
              </svg>
              Discord +5
            </a>
            {/* Universal Clock */}
            <div className="hidden xl:inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/60 border border-border/60 px-2.5 py-1.5 text-[10px] font-mono font-bold text-muted-foreground tabular-nums" title="Universal Time (UTC)">
              <Clock className="h-3 w-3 text-primary/70" />
              <span>{utcTime}</span>
              <span className="text-[8px] text-muted-foreground/60 font-semibold">UTC</span>
            </div>
            <ThemeToggle />
            <div className="hidden 2xl:block">
              <LanguageSwitcher />
            </div>
            <div className="2xl:hidden">
              <LanguageSwitcher compact />
            </div>
            {user && (
              <div className="hidden lg:flex items-center gap-2">
                <PluginStatus compact />
                <McpStatus compact />
              </div>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher compact />
          </div>

          {user ? (
            <>
              <Link
                to="/pricing"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-3 text-xs font-semibold text-primary-glow hover:bg-primary/20 transition whitespace-nowrap tabular-nums"
                title={`${profile?.credits ?? 0} credits`}
              >
                {formattedCredits} cr
              </Link>

              <div className="relative">
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  className="inline-flex h-9 max-w-[10.5rem] items-center gap-1.5 sm:gap-2 rounded-full border border-primary/20 bg-surface/85 pl-1.5 pr-2 text-xs font-semibold text-foreground shadow-sm hover:bg-surface-elevated transition"
                  aria-expanded={profileOpen}
                  aria-label="Open profile menu"
                  type="button"
                >
                  <ProfileAvatar src={avatarUrl} fallback={fallbackAvatar} />
                  <span className="hidden 2xl:inline min-w-0 max-w-[7rem] truncate">
                    {profile?.display_name || profile?.email?.split("@")[0]}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 text-muted-foreground transition ${profileOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 z-50 rounded-xl bg-surface-elevated border border-border shadow-2xl overflow-hidden animate-fade-in">
                      <div className="relative h-20 bg-gradient-brand">
                        {bannerUrl && (
                          <img src={bannerUrl} alt="Profile banner" className="h-full w-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-elevated via-surface-elevated/25 to-transparent" />
                      </div>
                      <div className="-mt-7 px-4 pb-3 border-b border-border/40 relative">
                        <ProfileAvatar src={avatarUrl} fallback={fallbackAvatar} size="lg" />
                        <p className="mt-2 text-sm font-semibold truncate">
                          {profile?.display_name || "Builder"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                      </div>
                      <div className="py-1.5">
                        <Link
                          to="/account"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground/90 hover:bg-surface transition"
                        >
                          <User className="h-3.5 w-3.5 text-muted-foreground" /> Profile
                        </Link>
                        <Link
                          to="/account"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground/90 hover:bg-surface transition"
                        >
                          <Settings className="h-3.5 w-3.5 text-muted-foreground" /> Settings
                        </Link>
                        <Link
                          to="/pricing"
                          onClick={() => setProfileOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground/90 hover:bg-surface transition"
                        >
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> Buy Credits
                        </Link>
                      </div>
                      <div className="border-t border-border/40 py-1.5">
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            signOut();
                          }}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 w-full transition"
                          type="button"
                        >
                          <LogOut className="h-3.5 w-3.5" /> Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="btn-shine rounded-lg bg-primary px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-glow)]"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      <nav
        className="md:hidden border-t border-border/70 bg-background/95 px-2 py-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex w-max min-w-full items-center gap-2">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const isProfile = item.to === "/account" && user;
            return (
              <Link
                key={item.to}
                to={item.to as any}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-2 text-xs font-semibold text-foreground active:scale-[0.98] hover:bg-surface-elevated"
              >
                {isProfile ? (
                  <ProfileAvatar src={avatarUrl} fallback={fallbackAvatar} />
                ) : (
                  Icon && <Icon className="h-3.5 w-3.5 text-primary" />
                )}
                {item.label}
              </Link>
            );
          })}
          <a
            href="https://kingdavez.click"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-2 text-xs font-semibold text-foreground active:scale-[0.98] hover:bg-surface-elevated"
          >
            <Box className="h-3.5 w-3.5 text-primary" /> 3D
          </a>
          <a
            href="https://discord.gg/J9TU7syJCr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#5865F2]/30 bg-[#5865F2]/15 px-3 py-2 text-xs font-bold text-[#8ea0ff] active:scale-[0.98] hover:bg-[#5865F2]/25"
          >
            Discord
          </a>
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} BloxSmith. Build real Roblox games with AI.</p>
        <p className="text-[11px] text-muted-foreground/80">
          Created & maintained by{" "}
          <a
            href="https://github.com/bobkinloch5-creator"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-glow hover:underline font-semibold"
          >
            Bob Kinloch
          </a>
        </p>
      </div>
    </footer>
  );
}
