import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Language = {
  code: string;
  label: string;
};

const STORAGE_KEY = "bloxsmith-language";
const TRANSLATE_ELEMENT_ID = "google_translate_element";

const LANGUAGES: Language[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "zh-CN", label: "Chinese Simplified" },
  { code: "zh-TW", label: "Chinese Traditional" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
  { code: "id", label: "Indonesian" },
  { code: "tl", label: "Filipino" },
  { code: "th", label: "Thai" },
  { code: "ms", label: "Malay" },
  { code: "bn", label: "Bengali" },
  { code: "ur", label: "Urdu" },
  { code: "fa", label: "Persian" },
  { code: "he", label: "Hebrew" },
  { code: "el", label: "Greek" },
  { code: "sv", label: "Swedish" },
  { code: "no", label: "Norwegian" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
  { code: "sk", label: "Slovak" },
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "sr", label: "Serbian" },
  { code: "sl", label: "Slovenian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "et", label: "Estonian" },
  { code: "sw", label: "Swahili" },
  { code: "af", label: "Afrikaans" },
];

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);
const POPULAR_CODES = new Set(["en", "es", "fr", "pt", "de", "ar", "hi", "zh-CN", "ja", "ko"]);

const GOOGLE_CODE_ALIASES: Record<string, string> = {
  he: "iw",
};

function toGoogleCode(code: string) {
  return GOOGLE_CODE_ALIASES[code] ?? code;
}

const INCLUDED_LANGUAGES = LANGUAGES.filter((language) => language.code !== "en")
  .map((language) => toGoogleCode(language.code))
  .join(",");

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
  }
}

let translateLoader: Promise<void> | null = null;

function getStoredLanguage() {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(STORAGE_KEY) || "en";
}

function setTranslateCookie(language: string) {
  const value = `/en/${toGoogleCode(language)}`;
  document.cookie = `googtrans=${value};path=/;SameSite=Lax`;

  if (window.location.hostname.includes(".")) {
    document.cookie = `googtrans=${value};path=/;domain=.${window.location.hostname};SameSite=Lax`;
  }
}

function clearTranslateCookie() {
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `googtrans=;expires=${expires};path=/`;

  if (window.location.hostname.includes(".")) {
    document.cookie = `googtrans=;expires=${expires};path=/;domain=.${window.location.hostname}`;
  }
}

function ensureTranslateElement() {
  let mount = document.getElementById(TRANSLATE_ELEMENT_ID);
  if (!mount) {
    mount = document.createElement("div");
    mount.id = TRANSLATE_ELEMENT_ID;
    mount.setAttribute("aria-hidden", "true");
    document.body.appendChild(mount);
  }

  if (!mount.childElementCount && window.google?.translate?.TranslateElement) {
    new window.google.translate.TranslateElement(
      {
        pageLanguage: "en",
        includedLanguages: INCLUDED_LANGUAGES,
        autoDisplay: false,
      },
      TRANSLATE_ELEMENT_ID,
    );
  }
}

function loadGoogleTranslate() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.translate?.TranslateElement) {
    ensureTranslateElement();
    return Promise.resolve();
  }
  if (translateLoader) return translateLoader;

  translateLoader = new Promise<void>((resolve, reject) => {
    window.googleTranslateElementInit = () => {
      ensureTranslateElement();
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="translate.google.com/translate_a/element.js"]',
    );
    if (existing) {
      existing.addEventListener(
        "load",
        () => {
          ensureTranslateElement();
          resolve();
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Translate failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.onerror = () => reject(new Error("Google Translate failed to load"));
    document.head.appendChild(script);
  });

  return translateLoader;
}

function reloadOnceForLanguage(language: string) {
  try {
    const key = `bloxsmith-translate-reload:${language}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch (_) {
    // sessionStorage unavailable — fall through and reload anyway.
  }
  window.location.reload();
}

function applyGoogleLanguage(language: string, attempts = 0) {
  const googleCode = toGoogleCode(language);
  const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (combo) {
    combo.value = googleCode;
    combo.dispatchEvent(new Event("change"));
    return;
  }

  if (attempts < 20) {
    window.setTimeout(() => applyGoogleLanguage(language, attempts + 1), 150);
    return;
  }

  reloadOnceForLanguage(language);
}

const PROTECT_SELECTOR = "pre, code, textarea, input, .notranslate, [data-notranslate]";

function protectTechnicalText() {
  document.querySelectorAll<HTMLElement>(PROTECT_SELECTOR).forEach((element) => {
    if (element.getAttribute("translate") === "no") return;
    element.classList.add("notranslate");
    element.setAttribute("translate", "no");
  });
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [language, setLanguage] = useState("en");
  const [open, setOpen] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    setLanguage(getStoredLanguage());
  }, []);

  const languageLabel = useMemo(
    () => LANGUAGES.find((item) => item.code === language)?.label ?? "Language",
    [language],
  );
  const popularLanguages = useMemo(
    () => LANGUAGES.filter((item) => POPULAR_CODES.has(item.code)),
    [],
  );
  const otherLanguages = useMemo(
    () => LANGUAGES.filter((item) => !POPULAR_CODES.has(item.code)),
    [],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (language === "en") {
      clearTranslateCookie();
      return;
    }

    let scheduled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const runProtect = () => {
      scheduled = false;
      idleHandle = null;
      timeoutHandle = null;
      protectTechnicalText();
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined;
      if (ric) {
        idleHandle = ric(runProtect, { timeout: 500 });
      } else {
        timeoutHandle = window.setTimeout(runProtect, 300);
      }
    };

    protectTechnicalText();
    setTranslateCookie(language);

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    observerRef.current = observer;

    loadGoogleTranslate()
      .then(() => applyGoogleLanguage(language))
      .catch(() => reloadOnceForLanguage(language));

    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (idleHandle != null && (window as any).cancelIdleCallback) {
        (window as any).cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [language]);

  useEffect(() => {
    if (!open || !compact) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, compact]);

  const handleChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setOpen(false);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);

    if (nextLanguage === "en") {
      clearTranslateCookie();
      window.location.reload();
    }
  };

  const renderLanguageButton = (item: Language) => (
    <button
      key={item.code}
      onClick={() => handleChange(item.code)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-background/35 active:bg-background/45"
      type="button"
      role="menuitemradio"
      aria-checked={language === item.code}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary-glow">
        {item.code.split("-")[0]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {item.code === "en" ? "Original website language" : "Translate website"}
        </span>
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        {language === item.code && <Check className="h-4 w-4 text-primary-glow" />}
      </span>
    </button>
  );

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 w-10 items-center justify-center rounded-xl border border-border/70 bg-surface/85 text-foreground shadow-[var(--shadow-card)] transition hover:bg-surface-elevated active:scale-95"
          aria-label={`Change language. Current language: ${languageLabel}`}
          aria-expanded={open}
          type="button"
          title={`Language: ${languageLabel}`}
        >
          <Globe2 className="h-4 w-4 text-primary-glow" />
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40 bg-background/45 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
            />
            <div className="fixed inset-x-3 top-[5.75rem] z-50 max-h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated/98 shadow-2xl backdrop-blur-xl animate-fade-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-3 sm:max-h-[28rem] sm:w-80">
              <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-surface-elevated/98 px-4 py-3">
                <div>
                  <p className="text-sm font-bold">Choose language</p>
                  <p className="text-xs text-muted-foreground">Current: {languageLabel}</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface/70"
                  aria-label="Close language picker"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto overscroll-contain">
                <div className="sticky top-0 z-10 border-b border-border/40 bg-surface-elevated/95 px-4 py-2 backdrop-blur-xl">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Popular
                  </p>
                </div>
                <div className="py-1.5">{popularLanguages.map(renderLanguageButton)}</div>
                <div className="sticky top-0 z-10 border-b border-border/40 bg-surface-elevated/95 px-4 py-2 backdrop-blur-xl">
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    More languages
                  </p>
                </div>
                <div className="py-1.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {otherLanguages.map(renderLanguageButton)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-2 rounded-lg border border-border/70 bg-surface/70 px-2.5 py-2 text-sm text-foreground shadow-sm transition hover:border-primary/40 hover:bg-surface",
      )}
      title={`Language: ${languageLabel}`}
    >
      <Globe2 className="h-4 w-4 shrink-0 text-primary-glow" />
      <span className="sr-only">Language</span>
      <select
        value={language}
        onChange={(event) => handleChange(event.target.value)}
        className="min-w-0 w-[9.75rem] appearance-none bg-transparent pr-5 text-sm font-medium outline-none"
        aria-label="Choose website language"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code} className="bg-background text-foreground">
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  );
}
