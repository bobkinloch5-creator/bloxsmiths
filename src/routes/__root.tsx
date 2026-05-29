import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useEffect } from "react";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/hooks/useTheme";
import { useUnlockAudio } from "@/hooks/useSounds";
import { ClickRipple } from "@/components/ClickRipple";
import { HelpChat } from "@/components/HelpChat";
import { AccountProfileSecurityMount } from "@/components/AccountProfileSecurityMount";
import { AccountProfileMediaMount } from "@/components/AccountProfileMediaMount";
import { AccountAnalyticsPolish } from "@/components/AccountAnalyticsPolish";
import { MfaSessionGuard } from "@/components/MfaSessionGuard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center glass rounded-2xl p-10">
        <h1 className="text-7xl font-bold gradient-text">404</h1>
        <p className="mt-4 text-muted-foreground">This page slipped through the workspace.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  const message = import.meta.env.DEV
    ? error.message
    : "An unexpected error occurred. Please try again.";
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center glass rounded-2xl p-10">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BloxSmith — Build Roblox Games With AI" },
      {
        name: "description",
        content:
          "Describe your Roblox game, generate scripts and systems, then sync directly into Roblox Studio.",
      },
      { property: "og:title", content: "BloxSmith — Build Roblox Games With AI" },
      {
        property: "og:description",
        content:
          "Describe your Roblox game, generate scripts and systems, then sync directly into Roblox Studio.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bloxsmith.pro" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "BloxSmith — Build Roblox Games With AI" },
      {
        name: "twitter:description",
        content:
          "Describe your Roblox game, generate scripts and systems, then sync directly into Roblox Studio.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d40a0299-aad3-4400-9750-9e748359ad0c",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/d40a0299-aad3-4400-9750-9e748359ad0c",
      },
      { name: "google-site-verification", content: "TT27YZIAvj3b076VGZ2HHVWMyaF_Szuqd0ZOjxdpSTE" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/logo.png" },
      { rel: "apple-touch-icon", href: "/logo.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "BloxSmith",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web, Roblox Studio",
          url: "https://bloxsmith.pro",
          description:
            "Describe your Roblox game in plain English. BloxSmith generates Luau scripts, full game systems, and Toolbox assets and syncs them directly into Roblox Studio.",
          image: "https://bloxsmith.pro/logo.png",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "120" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "BloxSmith",
          url: "https://bloxsmith.pro",
          logo: "https://bloxsmith.pro/logo.png",
          sameAs: ["https://bloxsmith.pro"],
          description:
            "AI-powered Roblox game builder that generates Luau scripts and syncs them into Roblox Studio.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "BloxSmith",
          url: "https://bloxsmith.pro",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://bloxsmith.pro/templates?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const HYDRATION_CLEANUP_SCRIPT = `
(function(){
  try {
    var html = document.documentElement;
    var body = document.body;
    var remove = ["crxlauncher"];
    for (var i = 0; i < remove.length; i++) {
      html && html.removeAttribute(remove[i]);
      body && body.removeAttribute(remove[i]);
    }
  } catch (_) {}
})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HYDRATION_CLEANUP_SCRIPT }} />
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function ImageGeneratorButtonInjector() {
  useEffect(() => {
    const setNativeValue = (element: HTMLTextAreaElement, value: string) => {
      const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
      const prototype = Object.getPrototypeOf(element);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (prototypeValueSetter && valueSetter !== prototypeValueSetter)
        prototypeValueSetter.call(element, value);
      else valueSetter?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const inject = () => {
      if (!location.pathname.startsWith("/project/")) return;
      if (document.querySelector("[data-bloxsmith-generate-image]")) return;

      const imageButton = Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Image",
      );
      if (!imageButton?.parentElement) return;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.bloxsmithGenerateImage = "true";
      button.title = "Generate Roblox thumbnail, icon, decal, badge, gamepass image, or promo art";
      button.className =
        "inline-flex h-8 items-center gap-1 rounded-lg border border-orange-400/40 bg-orange-500/10 px-2 text-orange-300 hover:bg-orange-500/20 transition";
      button.innerHTML =
        '<span aria-hidden="true">🎨</span><span class="text-[11px] font-medium">Generate Image</span>';
      button.addEventListener("click", () => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder*="Ask anything"], textarea[placeholder*="attach"], textarea',
        );
        if (!textarea) return;
        const current = textarea.value.trim();
        const prompt =
          "Generate a Roblox-ready 16:9 game thumbnail image. Make it colorful, premium, high-energy, clickable, and polished. Leave room for bold title text. Theme: " +
          (current || "my Roblox game");
        setNativeValue(textarea, prompt);
        textarea.focus();
      });

      imageButton.insertAdjacentElement("afterend", button);
    };

    inject();
    const observer = new MutationObserver(inject);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

function BetaBanner() {
  return (
    <div className="bg-amber-500/15 border-b border-amber-500/10 px-4 py-2 text-center text-xs text-amber-200/90 flex items-center justify-center gap-2 relative z-50">
      <span className="font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider text-amber-400">Beta</span>
      <span>BloxSmith is currently in beta. Some things might not work perfectly, but we are here to improve!</span>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useUnlockAudio();
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MfaSessionGuard />
          <BetaBanner />
          <Outlet />
          <AccountProfileMediaMount />
          <AccountProfileSecurityMount />
          <AccountAnalyticsPolish />
          <ImageGeneratorButtonInjector />
          <ClickRipple />
          <HelpChat />
          <Toaster theme="dark" position="top-right" />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
