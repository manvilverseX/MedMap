/**
 * useT() hook — returns a translation function for the current case language.
 *
 * Usage:
 *   const t = useT(caseLanguage);   // "English" | "Hindi" | "Kannada"
 *   <button>{t("startIntakeButton")}</button>
 *   <p>{t("intakeProgress", { index: 1, total: 10 })}</p>
 *
 * Behaviour:
 *  - For "English" (or undefined) returns English source strings instantly.
 *  - For "Hindi" / "Kannada": checks sessionStorage cache first.
 *    If cache miss, fetches /api/v1/translate/ui, stores result, re-renders.
 *  - While loading, returns English (no blocking spinner).
 *  - Exposes `fallbackNotice` and `aiTranslationTag` from the API response.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  EN_STRINGS,
  type StringKey,
  type LangCode,
  getCachedStrings,
  setCachedStrings,
  interpolate,
} from "./strings";
import { API_BASE_URL } from "../utils/api";

export interface UseTResult {
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  ready: boolean;
  fallbackNotice: string | null;
  aiTranslationTag: string | null;
  lang: LangCode;
}

function normaliseLang(raw?: string | null): LangCode {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (lower.startsWith("hi")) return "hi";
  if (lower.startsWith("kn") || lower === "kannada") return "kn";
  return "en";
}

export function useT(rawLang?: string | null): UseTResult {
  const lang = normaliseLang(rawLang);

  const [localizedStrings, setLocalizedStrings] = useState<Record<string, string> | null>(() =>
    lang === "en" ? null : getCachedStrings(lang)
  );
  const [ready, setReady] = useState<boolean>(lang === "en" || localizedStrings !== null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [aiTranslationTag, setAiTranslationTag] = useState<string | null>(null);

  // Keep track of inflight request to avoid duplicate fetches
  const fetchingRef = useRef<string | null>(null);

  const fetchTranslations = useCallback(
    async (targetLang: LangCode) => {
      if (targetLang === "en") return;
      if (fetchingRef.current === targetLang) return;
      fetchingRef.current = targetLang;

      const token = sessionStorage.getItem("token");
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
          lang === "hi"
            ? "अनुवाद उपलब्ध नहीं है, अंग्रेज़ी में दिखाया जा रहा है।"
            : lang === "kn"
            ? "ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ, ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತಿದೆ."
            : null
        );
      } finally {
        fetchingRef.current = null;
      }
    },
    [lang]
  );

  useEffect(() => {
    if (lang === "en") {
      setLocalizedStrings(null);
      setReady(true);
      return;
    }
    const cached = getCachedStrings(lang);
    if (cached) {
      setLocalizedStrings(cached);
      setReady(true);
    } else {
      // Show English immediately while loading (< 2s target)
      setReady(false);
      const timer = setTimeout(() => setReady(true), 2000); // never block > 2s
      fetchTranslations(lang).finally(() => clearTimeout(timer));
      return () => clearTimeout(timer);
    }
  }, [lang, fetchTranslations]);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>): string => {
      const source = EN_STRINGS[key] as string;
      const localized =
        localizedStrings && localizedStrings[key] != null
          ? (localizedStrings[key] as string)
          : source;
      return vars ? interpolate(localized, vars) : localized;
    },
    [localizedStrings]
  );

  return { t, ready, fallbackNotice, aiTranslationTag, lang };
}
