import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { t, getSupportedLanguages, setCachedStrings, EN_STRINGS } from '../i18n/strings';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import { DoctorCaseCard } from '../components/doctor/DoctorCaseCard';
import * as api from '../utils/api';
import { CaseProvider } from '../context/CaseContext';

vi.mock('../utils/api');

describe('Multilingual i18n & Patient/Doctor views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('i18n dictionary (strings.ts)', () => {
    it('returns default English strings', () => {
      expect(t('startIntakeButton', 'en')).toBe('Start Intake');
      expect(t('submit', 'en')).toBe('Submit');
    });

    it('returns cached translations when available', () => {
      setCachedStrings('kn', {
        startIntakeButton: 'ಪ್ರಶ್ನಾವಳಿ ಪ್ರಾರಂಭಿಸಿ',
      });
      expect(t('startIntakeButton', 'kn')).toBe('ಪ್ರಶ್ನಾವಳಿ ಪ್ರಾರಂಭಿಸಿ');
    });

    it('falls back to English when a string is not yet translated', () => {
      (EN_STRINGS as any).untranslatedTestKey = 'Untranslated Test';
      expect(t('untranslatedTestKey' as any, 'kn')).toBe('Untranslated Test');
      delete (EN_STRINGS as any).untranslatedTestKey;
    });

    it('lists supported languages with en, hi, kn', () => {
      const langs = getSupportedLanguages();
      const codes = langs.map(l => l.code);
      expect(codes).toEqual(['en', 'hi', 'kn']);
    });
  });

  describe('PatientIntakePage multilingual rendering', () => {
    it('renders localized prompt and helperText when case language is kn', async () => {
      sessionStorage.setItem('activeCaseId', 'test-kn-case');
      localStorage.setItem('medmap_token', 'fake-token');

      const mockCase: any = {
        caseId: 'test-kn-case',
        patientId: 'patient-kn',
        status: 'intake',
        language: 'kn',
        consultationType: 'general',
        intakeAnswers: {},
      };

      const mockSession: any = {
        state: 'question',
        currentQuestion: {
          id: 'chief_complaint',
          prompt: 'What brings you to see the doctor today?',
          promptLocalized: 'ಇಂದು ನೀವು ವೈದ್ಯರನ್ನು ಭೇಟಿ ಮಾಡಲು ಕಾರಣವೇನು?',
          category: 'Chief Complaint',
          categoryLocalized: 'ಮುಖ್ಯ ದೂರು',
          inputType: 'text',
          helperText: 'Describe your main symptoms.',
          helperTextLocalized: 'ನಿಮ್ಮ ಮುಖ್ಯ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ.',
        },
        answeredQuestionIds: [],
        totalEligibleQuestions: 5,
        language: 'kn',
        aiTranslationTag: 'AI ಅನುವಾದ, ದೋಷಗಳಿರಬಹುದು',
      };

      vi.mocked(api.getCase).mockResolvedValue(mockCase);
      vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue(mockSession);
      vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
      vi.mocked(api.getCaseDocuments).mockResolvedValue([]);

      render(
        <BrowserRouter>
          <CaseProvider>
            <PatientIntakePage />
          </CaseProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('ಇಂದು ನೀವು ವೈದ್ಯರನ್ನು ಭೇಟಿ ಮಾಡಲು ಕಾರಣವೇನು?')).toBeInTheDocument();
        expect(screen.getByText('ನಿಮ್ಮ ಮುಖ್ಯ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ.')).toBeInTheDocument();
        expect(screen.getAllByText('ಮುಖ್ಯ ದೂರು').length).toBeGreaterThan(0);
      });

      // Verify AI translation badge is shown
      expect(screen.getByText(/AI ಅನುವಾದ, ದೋಷಗಳಿರಬಹುದು/)).toBeInTheDocument();
    });

    it('renders localized options for multiple-choice questions in Kannada', async () => {
      sessionStorage.setItem('activeCaseId', 'test-kn-choice');
      localStorage.setItem('medmap_token', 'fake-token');

      const mockCase: any = {
        caseId: 'test-kn-choice',
        patientId: 'patient-kn-choice',
        status: 'intake',
        language: 'kn',
        consultationType: 'general',
        intakeAnswers: {},
      };

      const mockSession: any = {
        state: 'question',
        currentQuestion: {
          id: 'symptom_duration',
          prompt: 'How long have you had these symptoms?',
          promptLocalized: 'ಈ ರೋಗಲಕ್ಷಣಗಳು ಎಷ್ಟು ದಿನಗಳಿಂದ ಇವೆ?',
          category: 'History',
          categoryLocalized: 'ಇತಿಹಾಸ',
          inputType: 'single_choice',
          options: [
            { id: 'lt_1_day', label: 'Less than 1 day' },
            { id: '1_to_3_days', label: '1 to 3 days' },
          ],
          optionsLocalized: [
            { id: 'lt_1_day', label: '1 ದಿನಕ್ಕಿಂತ ಕಡಿಮೆ' },
            { id: '1_to_3_days', label: '1 ರಿಂದ 3 ದಿನಗಳು' },
          ],
        },
        answeredQuestionIds: ['chief_complaint'],
        totalEligibleQuestions: 5,
        language: 'kn',
      };

      vi.mocked(api.getCase).mockResolvedValue(mockCase);
      vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue(mockSession);
      vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
      vi.mocked(api.getCaseDocuments).mockResolvedValue([]);

      render(
        <BrowserRouter>
          <CaseProvider>
            <PatientIntakePage />
          </CaseProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('1 ದಿನಕ್ಕಿಂತ ಕಡಿಮೆ')).toBeInTheDocument();
        expect(screen.getByText('1 ರಿಂದ 3 ದಿನಗಳು')).toBeInTheDocument();
      });
    });
  });

  describe('DoctorCaseDetailPage bilingual inspection', () => {
    it('displays patient language toggle and bilingual evidence', async () => {
      localStorage.setItem('medmap_token', 'doctor-jwt-token');

      const mockDoctorCase: any = {
        caseId: 'doc-kn-case',
        patientId: 'patient-456',
        patientName: 'Suresh Kumar',
        patientAge: 48,
        patientGender: 'Male',
        status: 'doctor_review',
        language: 'kn',
        consultationType: 'general',
        intakeAnswers: {
          chief_complaint: {
            value: 'Severe cough and mild fever since 2 days',
            original: 'ಎರಡು ದಿನಗಳಿಂದ ತೀವ್ರ ಕೆಮ್ಮು ಮತ್ತು ಸೌಮ್ಯ ಜ್ವರ',
            lang: 'kn',
          },
        },
        derivedClinicalData: {
          medicalEntities: {
            diagnoses: ['Acute Bronchitis'],
            medications: [],
            investigations: [],
            procedures: [],
          },
          doctorReviews: {},
        },
        aiSummary: {
          chiefComplaint: 'Severe cough and mild fever',
          summary: 'Patient reports severe cough and fever for 2 days.',
        },
      };

      vi.mocked(api.getCase).mockResolvedValue(mockDoctorCase);
      vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
      vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
        redFlags: [],
        missingInformation: [],
        confidenceAssessment: {},
      });
      vi.mocked(api.getUnifiedCase).mockResolvedValue(null);

      render(
        <MemoryRouter initialEntries={['/doctor/cases/doc-kn-case']}>
          <Routes>
            <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/English \(Canonical\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Patient's Language \(kn\)/i)).toBeInTheDocument();
      });

      // Initially shows canonical English answer
      expect(screen.getByText(/Severe cough and mild fever since 2 days/i)).toBeInTheDocument();

      // Click Patient's Language toggle
      const patientLangBtn = screen.getByRole('button', { name: /Patient's Language \(kn\)/i });
      fireEvent.click(patientLangBtn);

      // Now original Kannada statement appears in intake answers
      await waitFor(() => {
        expect(screen.getByText(/ಎರಡು ದಿನಗಳಿಂದ ತೀವ್ರ ಕೆಮ್ಮು ಮತ್ತು ಸೌಮ್ಯ ಜ್ವರ/)).toBeInTheDocument();
      });
    });

    it('surfaces warning banner and manual review badge when non-English translation fails', async () => {
      localStorage.setItem('medmap_token', 'doctor-jwt-token');

      const failedCase: any = {
        caseId: 'doc-failed-trans-case',
        patientId: 'patient-789',
        status: 'doctor_review',
        language: 'kn',
        consultationType: 'general',
        intakeAnswers: {
          chief_complaint: {
            value: 'ತೀವ್ರ ಎದೆ ನೋವು',
            original: 'ತೀವ್ರ ಎದೆ ನೋವು',
            lang: 'kn',
            translated: false,
            translationFailed: true,
          },
        },
        derivedClinicalData: {
          translationScreeningIncomplete: true,
          translationFailedAnswers: [
            { questionId: 'chief_complaint', original: 'ತೀವ್ರ ಎದೆ ನೋವು', lang: 'kn' }
          ],
          medicalEntities: { diagnoses: [], medications: [], investigations: [], procedures: [] },
          doctorReviews: {},
        },
      };

      vi.mocked(api.getCase).mockResolvedValue(failedCase);
      vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
      vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
        redFlags: [],
        missingInformation: [],
        confidenceAssessment: {},
      });
      vi.mocked(api.getUnifiedCase).mockResolvedValue(null);

      // 1. Verify DoctorCaseDetailPage displays visible warning banner and original text
      render(
        <MemoryRouter initialEntries={['/doctor/cases/doc-failed-trans-case']}>
          <Routes>
            <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Automatic red-flag screening could not run on some non-English answers. Please review the original patient answers manually./i)
        ).toBeInTheDocument();
        expect(screen.getAllByText(/ತೀವ್ರ ಎದೆ ನೋವು/).length).toBeGreaterThan(0);
      });

      // 2. Verify DoctorCaseCard displays "Manual review needed" badge
      render(
        <MemoryRouter>
          <DoctorCaseCard caseItem={failedCase} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Manual review needed/i)).toBeInTheDocument();
    });
  });
});
