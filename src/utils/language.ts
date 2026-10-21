/**
 * Canonical Language Normalization for MedMap Frontend.
 * Supported patient intake languages:
 *   - English (en)
 *   - Hindi (hi)
 *   - Kannada (kn)
 */

export type SupportedLanguage = 'en' | 'hi' | 'kn';

/**
 * Normalizes any language input into 'en' | 'hi' | 'kn'.
 * Accepts:
 *   - Kannada: "Kannada", "kannada", "kn", "kn-IN", "kn_IN", "ಕನ್ನಡ"
 *   - Hindi: "Hindi", "hindi", "hi", "hi-IN", "hi_IN", "हिंदी", "हिन्दी"
 *   - English: "English", "english", "en", "en-IN", etc.
 *   - null / undefined / unknown -> "en"
 */
export function normalizeLanguage(raw?: string | null): SupportedLanguage {
  if (!raw) return 'en';
  const val = String(raw).trim();
  if (!val) return 'en';

  if (val.includes('ಕನ್ನಡ')) return 'kn';
  if (val.includes('हिंदी') || val.includes('हिन्दी')) return 'hi';

  const lower = val.toLowerCase();
  if (
    lower.includes('kannada') ||
    lower === 'kn' ||
    lower.startsWith('kn-') ||
    lower.startsWith('kn_') ||
    lower === 'ka' ||
    lower.startsWith('ka-') ||
    lower.startsWith('ka_')
  ) {
    return 'kn';
  }

  if (
    lower.includes('hindi') ||
    lower === 'hi' ||
    lower.startsWith('hi-') ||
    lower.startsWith('hi_')
  ) {
    return 'hi';
  }

  if (
    lower.includes('english') ||
    lower === 'en' ||
    lower.startsWith('en-') ||
    lower.startsWith('en_')
  ) {
    return 'en';
  }

  return 'en';
}

export const normaliseLang = normalizeLanguage;

