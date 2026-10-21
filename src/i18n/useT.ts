/**
 * useT() hook — returns a translation function for the current language.
 *
 * Usage:
 *   const { t } = useT(caseLanguage);   // "English" | "Hindi" | "Kannada" | undefined
 *   <button>{t("startIntakeButton")}</button>
 *   <p>{t("intakeProgress", { index: 1, total: 10 })}</p>
 *
 * Behaviour:
 *  - For "English" (or undefined default): returns English source strings.
 *  - Hierarchy for "Hindi" / "Kannada":
 *      (1) Static dictionary (KN_STRINGS / HI_STRINGS)
 *      (2) sessionStorage UI cache
 *      (3) POST /api/v1/translate/ui (cached in DB translation_cache)
 *      (4) English fallback with dev-only console.warn
 *  - Re-renders immediately on language change and updates HTML lang and document.title.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  EN_STRINGS,
  HI_STRINGS,
  KN_STRINGS,
  type StringKey,
  type LangCode,
  getCachedStrings,
  setCachedStrings,
  interpolate,
} from "./strings";
import { API_BASE_URL } from "../utils/api";
import { normalizeLanguage, getSessionLanguage, setSessionLanguage } from "../utils/language";

export interface UseTResult {
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  ready: boolean;
  fallbackNotice: string | null;
  aiTranslationTag: string | null;
  lang: LangCode;
}

export function useT(rawLang?: string | null): UseTResult {
  const [currentLang, setCurrentLang] = useState<LangCode>(() => {
    if (rawLang) return normalizeLanguage(rawLang);
    return getSessionLanguage();
  });

  // Keep in sync if rawLang prop changes
  useEffect(() => {
    if (rawLang) {
      const norm = normalizeLanguage(rawLang);
      setCurrentLang(norm);
      setSessionLanguage(norm);
    }
  }, [rawLang]);

  // Listen to global language change events
  useEffect(() => {
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: LangCode }>;
      if (customEvent.detail?.lang) {
        setCurrentLang(customEvent.detail.lang);
      }
    };
    window.addEventListener("medmap_language_change", handleLangChange);
    return () => {
      window.removeEventListener("medmap_language_change", handleLangChange);
    };
  }, []);

  // Update HTML lang and document title
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = currentLang;
      if (currentLang === "kn") {
        document.title = "MedMap - ಎಐ ಪೂರ್ವ ಸಮಾಲೋಚನೆ";
      } else if (currentLang === "hi") {
        document.title = "MedMap - एआई पूर्व-परामर्श";
      } else {
        document.title = "MedMap - AI Pre-Consultation Case-Taking";
      }
    }
  }, [currentLang]);

  const [localizedStrings, setLocalizedStrings] = useState<Record<string, string> | null>(() =>
    currentLang === "en" ? null : getCachedStrings(currentLang)
  );
  const [ready, setReady] = useState<boolean>(currentLang === "en" || localizedStrings !== null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [aiTranslationTag, setAiTranslationTag] = useState<string | null>(null);

  const fetchingRef = useRef<string | null>(null);

  const fetchTranslations = useCallback(
    async (targetLang: LangCode) => {
      if (targetLang === "en") return;
      if (fetchingRef.current === targetLang) return;
      fetchingRef.current = targetLang;

      const token = sessionStorage.getItem("token") || localStorage.getItem("medmap_token");
      try {
        const resp = await fetch(`${API_BASE_URL}/translate/ui`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            lang: targetLang,
            strings: EN_STRINGS as Record<string, string>,
          }),
        });
        if (!resp.ok) throw new Error(`translate/ui ${resp.status}`);
        const data = await resp.json();
        if (data.strings) {
          setCachedStrings(targetLang, data.strings);
          setLocalizedStrings(data.strings);
          setFallbackNotice(data.fallbackNotice ?? null);
          setAiTranslationTag(data.aiTranslationTag ?? null);
          setReady(true);
        }
      } catch {
        // Translation failed — show English with fallback notice
        setReady(true);
        setFallbackNotice(
          targetLang === "hi"
            ? "अनुवाद उपलब्ध नहीं है, अंग्रेज़ी में दिखाया जा रहा है।"
            : targetLang === "kn"
            ? "ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ, ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ."
            : null
        );
      } finally {
        fetchingRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (currentLang === "en") {
      setLocalizedStrings(null);
      setReady(true);
      return;
    }
    const cached = getCachedStrings(currentLang);
    if (cached) {
      setLocalizedStrings(cached);
      setReady(true);
    } else {
      setReady(false);
      const timer = setTimeout(() => setReady(true), 2000);
      fetchTranslations(currentLang).finally(() => clearTimeout(timer));
      return () => clearTimeout(timer);
    }
  }, [currentLang, fetchTranslations]);

  const loggedMissingKeys = useRef<Set<string>>(new Set());

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>): string => {
      // 1. Static dictionary
      let text: string | undefined;
      if (currentLang === "kn" && KN_STRINGS[key]) {
        text = KN_STRINGS[key];
      } else if (currentLang === "hi" && HI_STRINGS[key]) {
        text = HI_STRINGS[key];
      }

      // 2. SessionStorage UI cache
      if (!text && localizedStrings && localizedStrings[key]) {
        text = localizedStrings[key];
      }

      // 3. Fallback to English and log dev warning if missing in non-English
      if (!text) {
        text = EN_STRINGS[key];
        if (currentLang !== "en") {
          const warnKey = `${currentLang}:${key}`;
          if (!loggedMissingKeys.current.has(warnKey)) {
            loggedMissingKeys.current.add(warnKey);
            if (process.env.NODE_ENV !== "production") {
              console.warn(`[i18n] Missing translation for "${key}" in language "${currentLang}"`);
            }
          }
        }
      }

      const finalStr = text ?? (key as string);
      return vars ? interpolate(finalStr, vars) : finalStr;
    },
    [localizedStrings, currentLang]
  );

  return { t, ready, fallbackNotice, aiTranslationTag, lang: currentLang };
}
