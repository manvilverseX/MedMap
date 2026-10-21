import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EN_STRINGS, HI_STRINGS, KN_STRINGS, type StringKey } from '../i18n/strings';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PatientOnboardingPage } from '../pages/patient/PatientOnboardingPage';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import { PatientDocumentsPage } from '../pages/patient/PatientDocumentsPage';
import { PatientVerificationPage } from '../pages/patient/PatientVerificationPage';
import { InactivityCountdownBanner } from '../components/patient/InactivityCountdownBanner';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { StatusBadge } from '../components/StatusBadge';
import { CaseProvider } from '../context/CaseContext';
import { setSessionLanguage } from '../utils/language';
import * as api from '../utils/api';
import fs from 'fs';
import path from 'path';

vi.mock('../utils/api');

const ALLOWLIST_TOKENS = [
  'MedMap',
  'ABHA',
  'ABDM',
  'AI',
  'PDF',
  'PNG',
  'JPG',
  'JPEG',
  'WebP',
  'MB',
  'KB',
  'Web Speech API',
  'p-12345',
  '1234',
  '112',
  '911',
  'Ayurveda',
  'AYUSH',
  'English',
  'Dashavidha',
  'Pariksha',
  'Prakriti',
  'Agni',
  'Sara',
  'Satva',
  'Vaya',
  'Koshtha',
];

/**
 * Checks a DOM container for any leaked English words (3+ Latin letters)
 * outside the allowlist.
 */
function assertNoEnglishLeaks(container: HTMLElement, contextName: string) {
  // Collect text nodes
  const texts: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const val = node.nodeValue?.trim();
    if (val) texts.push(val);
    node = walker.nextNode();
  }

  // Collect attributes: placeholder, title, aria-label, alt
  const elements = container.querySelectorAll('*');
  elements.forEach((el) => {
    ['placeholder', 'title', 'aria-label', 'alt'].forEach((attr) => {
      const val = el.getAttribute(attr)?.trim();
      if (val) texts.push(val);
    });
  });

  const offendingLeaks: string[] = [];

  for (const text of texts) {
    // Strip allowlisted tokens and numbers
    let cleaned = text;
    for (const token of ALLOWLIST_TOKENS) {
      cleaned = cleaned.replace(new RegExp(`\\b${token}\\b`, 'gi'), ' ');
    }
    cleaned = cleaned.replace(/[0-9]/g, ' ');
    cleaned = cleaned.replace(/[-–—_.,;:!?()[\]{}<>/\\|@#$%^&*+=~`'"]/g, ' ');

    // Look for words with 3 or more Latin letters
    const latinWords = cleaned.match(/[a-zA-Z]{3,}/g);
    if (latinWords) {
      // Filter out technical allowlist or empty matches
      const nonAllowlisted = latinWords.filter(
        (w) => !ALLOWLIST_TOKENS.some((a) => a.toLowerCase() === w.toLowerCase())
      );
      if (nonAllowlisted.length > 0) {
        offendingLeaks.push(`Found leaked English words [${nonAllowlisted.join(', ')}] in: "${text}"`);
      }
    }
  }

  expect(
    offendingLeaks,
    `[${contextName}] English leak detected:\n${offendingLeaks.join('\n')}`
  ).toEqual([]);
}

describe('PHASE 5: English Leak & i18n Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('medmap_token', 'mock-token');
    if (api.getUnifiedCase) {
      vi.mocked(api.getUnifiedCase).mockResolvedValue(null as any);
    }
  });

  describe('1. Dictionary Completeness & Script Verification', () => {
    const allKeys = Object.keys(EN_STRINGS) as StringKey[];

    it('contains non-empty translations for all keys in both HI and KN', () => {
      for (const key of allKeys) {
        expect(HI_STRINGS[key], `Missing HI translation for key: ${key}`).toBeTruthy();
        expect(KN_STRINGS[key], `Missing KN translation for key: ${key}`).toBeTruthy();
      }
    });

    it('contains native scripts (Devanagari for HI, Kannada for KN)', () => {
      const devanagariRegex = /[\u0900-\u097F]/;
      const kannadaRegex = /[\u0C80-\u0CFF]/;

      for (const key of allKeys) {
        const enVal = EN_STRINGS[key];
        const hiVal = HI_STRINGS[key];
        const knVal = KN_STRINGS[key];

        // If the English value is not purely allowlisted (like "MedMap")
        const isPureAllowlist = ALLOWLIST_TOKENS.some(
          (t) => t.toLowerCase() === enVal.trim().toLowerCase()
        );
        if (!isPureAllowlist) {
          expect(
            devanagariRegex.test(hiVal),
            `HI translation for '${key}' must contain Devanagari script: "${hiVal}"`
          ).toBe(true);

          expect(
            kannadaRegex.test(knVal),
            `KN translation for '${key}' must contain Kannada script: "${knVal}"`
          ).toBe(true);
        }
      }
    });

    it('does not equal English copy except for allowlisted tokens', () => {
      for (const key of allKeys) {
        const enVal = EN_STRINGS[key];
        const hiVal = HI_STRINGS[key];
        const knVal = KN_STRINGS[key];

        const isPureAllowlist = ALLOWLIST_TOKENS.some(
          (t) => t.toLowerCase() === enVal.trim().toLowerCase()
        );
        if (!isPureAllowlist) {
          expect(hiVal, `HI string for '${key}' equals English: "${hiVal}"`).not.toBe(enVal);
          expect(knVal, `KN string for '${key}' equals English: "${knVal}"`).not.toBe(enVal);
        }
      }
    });
  });

  describe('2. Patient-Facing UI Screen DOM Audits', () => {
    ['kn', 'hi'].forEach((lang) => {
      it(`renders LandingPage in ${lang} without English leaks`, () => {
        setSessionLanguage(lang);
        const { container } = render(
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        );
        assertNoEnglishLeaks(container, `LandingPage (${lang})`);
      });

      it(`renders NotFoundPage in ${lang} without English leaks`, () => {
        setSessionLanguage(lang);
        const { container } = render(
          <MemoryRouter>
            <NotFoundPage />
          </MemoryRouter>
        );
        assertNoEnglishLeaks(container, `NotFoundPage (${lang})`);
      });

      it(`renders InactivityCountdownBanner in ${lang} without English leaks`, () => {
        setSessionLanguage(lang);
        const { container } = render(
          <InactivityCountdownBanner
            timeoutSeconds={45}
            warningThresholdSeconds={60}
            onClearDevice={() => {}}
            lang={lang}
          />
        );
        assertNoEnglishLeaks(container, `InactivityCountdownBanner (${lang})`);
      });

      it(`renders ErrorMessage, StatusBadge, LoadingIndicator in ${lang} without English leaks`, () => {
        setSessionLanguage(lang);
        const { container } = render(
          <div>
            <ErrorMessage message={lang === 'kn' ? 'ದೋಷ ಸಂಭವಿಸಿದೆ' : 'त्रुटि हुई'} onRetry={() => {}} />
            <LoadingIndicator message={lang === 'kn' ? 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…' : 'लोड हो रहा है…'} />
            <StatusBadge status="intake" />
            <StatusBadge status="patient_verifying" />
          </div>
        );
        assertNoEnglishLeaks(container, `Common Components (${lang})`);
      });

      it(`renders PatientOnboardingPage in ${lang} without English leaks`, () => {
        setSessionLanguage(lang);
        const { container } = render(
          <MemoryRouter>
            <CaseProvider>
              <PatientOnboardingPage />
            </CaseProvider>
          </MemoryRouter>
        );
        assertNoEnglishLeaks(container, `PatientOnboardingPage (${lang})`);
      });

      it(`renders PatientIntakePage question state in ${lang} without English leaks`, async () => {
        setSessionLanguage(lang);
        sessionStorage.setItem('activeCaseId', '1001');

        vi.mocked(api.getCase).mockResolvedValue({
          caseId: '1001',
          patientId: '2002',
          status: 'intake',
          language: lang,
          intakeAnswers: {},
        } as any);

        vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue({
          state: 'question',
          answeredQuestionIds: [],
          currentQuestion: {
            id: 'chief_complaint',
            category: 'Chief Complaint',
            categoryLocalized: lang === 'kn' ? 'ಮುಖ್ಯ ತೊಂದರೆ' : 'मुख्य समस्या',
            prompt: 'What brings you here?',
            promptLocalized: lang === 'kn' ? 'ನಿಮಗೆ ಇಂದು ಏನು ತೊಂದರೆ ಇದೆ?' : 'आज आपको क्या समस्या है?',
            helperText: 'Describe symptoms',
            helperTextLocalized: lang === 'kn' ? 'ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ' : 'अपने लक्षणों का वर्णन करें',
            inputType: 'text',
          },
        } as any);

        const { container } = render(
          <MemoryRouter>
            <CaseProvider>
              <PatientIntakePage />
            </CaseProvider>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByRole('button', { name: /ಮುಂದುವರಿಯಿರಿ|आगे बढ़ें/ })).toBeInTheDocument();
        });

        assertNoEnglishLeaks(container, `PatientIntakePage question (${lang})`);
      });

      it(`renders PatientIntakePage clarification & critical confirmation in ${lang} without leaks`, async () => {
        setSessionLanguage(lang);
        sessionStorage.setItem('activeCaseId', '1001');

        vi.mocked(api.getCase).mockResolvedValue({
          caseId: '1001',
          patientId: '2002',
          status: 'intake',
          language: lang,
          intakeAnswers: {},
        } as any);

        vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue({
          state: 'clarification',
          issue: 'Please be more specific',
          issueLocalized: lang === 'kn' ? 'ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾಗಿ ತಿಳಿಸಿ' : 'कृपया अधिक स्पष्ट बताएं',
          originalAnswer: lang === 'kn' ? 'ಜ್ವರ' : 'बुखार',
          answeredQuestionIds: [],
          currentQuestion: {
            id: 'fever_duration',
            category: 'History',
            categoryLocalized: lang === 'kn' ? 'ಹಿನ್ನೆಲೆ' : 'इतिहास',
            prompt: 'How many days?',
            promptLocalized: lang === 'kn' ? 'ಎಷ್ಟು ದಿನಗಳಿಂದ ಜ್ವರವಿದೆ?' : 'कितने दिनों से बुखार है?',
            inputType: 'text',
          },
        } as any);

        const { container } = render(
          <MemoryRouter>
            <CaseProvider>
              <PatientIntakePage />
            </CaseProvider>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByText(lang === 'kn' ? /ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾಗಿ ತಿಳಿಸಿ/ : /कृपया अधिक स्पष्ट बताएं/)).toBeInTheDocument();
        });

        assertNoEnglishLeaks(container, `PatientIntakePage clarification (${lang})`);
      });

      it(`renders PatientDocumentsPage in ${lang} without English leaks`, async () => {
        setSessionLanguage(lang);
        sessionStorage.setItem('activeCaseId', '1001');

        const { container } = render(
          <MemoryRouter>
            <CaseProvider>
              <PatientDocumentsPage />
            </CaseProvider>
          </MemoryRouter>
        );

        assertNoEnglishLeaks(container, `PatientDocumentsPage (${lang})`);
      });

      it(`renders PatientVerificationPage in ${lang} without English leaks`, async () => {
        setSessionLanguage(lang);
        sessionStorage.setItem('activeCaseId', '1001');

        vi.mocked(api.getCase).mockResolvedValue({
          caseId: '1001',
          patientId: '2002',
          status: 'patient_verifying',
          language: lang,
          intakeAnswers: {
            chief_complaint: lang === 'kn' ? 'ತಲೆನೋವು' : 'सिरदर्द',
          },
        } as any);
        vi.mocked(api.getCaseDocuments).mockResolvedValue([]);

        const { container } = render(
          <MemoryRouter>
            <CaseProvider>
              <PatientVerificationPage />
            </CaseProvider>
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        });

        assertNoEnglishLeaks(container, `PatientVerificationPage (${lang})`);
      });
    });
  });

  describe('3. Layout & Mobile Responsive Text Wrapping', () => {
    it('verifies index.css contains overflow-wrap: anywhere for responsive Indic text wrapping', () => {
      const cssPath = path.resolve(__dirname, '../index.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      expect(cssContent).toContain('overflow-wrap: anywhere');
      expect(cssContent).toContain('min-width: 320px');
    });
  });
});
