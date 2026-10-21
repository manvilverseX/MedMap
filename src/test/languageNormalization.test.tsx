import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { normalizeLanguage } from '../utils/language';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import * as api from '../utils/api';

vi.mock('../utils/api');

describe('Language Normalization Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('1. normalizeLanguage unit tests', () => {
    it('normalizes all Kannada variants to "kn"', () => {
      const variants = [
        'Kannada',
        'kannada',
        'kn',
        'kn-IN',
        'kn_IN',
        'ಕನ್ನಡ',
        'ka',
        'ka-IN',
        'kannada (kn)',
      ];
      for (const v of variants) {
        expect(normalizeLanguage(v)).toBe('kn');
      }
    });

    it('normalizes all Hindi variants to "hi"', () => {
      const variants = [
        'Hindi',
        'hindi',
        'hi',
        'hi-IN',
        'hi_IN',
        'हिंदी',
        'हिन्दी',
        'hindi (hi)',
      ];
      for (const v of variants) {
        expect(normalizeLanguage(v)).toBe('hi');
      }
    });

    it('normalizes all English and fallback variants to "en"', () => {
      const variants = [
        'English',
        'english',
        'en',
        'en-IN',
        'en_IN',
        'en-US',
        null,
        undefined,
        '',
        '   ',
        'unknown',
        'de',
      ];
      for (const v of variants) {
        expect(normalizeLanguage(v)).toBe('en');
      }
    });

    it('normalizes all 9 distinct DB language strings correctly', () => {
      const dbValues: Record<string, string> = {
        'Kannada': 'kn',
        'kn': 'kn',
        'Hindi': 'hi',
        'hi': 'hi',
        'English': 'en',
        'en': 'en',
        'en-IN': 'en',
        'de': 'en',
      };
      for (const [input, expected] of Object.entries(dbValues)) {
        expect(normalizeLanguage(input)).toBe(expected);
      }
      expect(normalizeLanguage(null)).toBe('en');
    });
  });

  describe('2. DoctorCaseDetailPage with real stored dropdown values ("Kannada" / "Hindi" / "English")', () => {
    it('shows Language View toggle for language="Kannada"', async () => {
      localStorage.setItem('medmap_token', 'doctor-jwt-token');

      const mockDoctorCase: any = {
        caseId: 'doc-kannada-case',
        patientId: 'patient-kn',
        status: 'doctor_review',
        language: 'Kannada',
        intakeAnswers: {
          chief_complaint: {
            value: 'Severe chest pain',
            original: 'ತೀವ್ರ ಎದೆ ನೋವು',
            lang: 'kn',
          },
        },
        derivedClinicalData: {
          medicalEntities: { diagnoses: [], medications: [], investigations: [], procedures: [] },
          doctorReviews: {},
        },
        aiSummary: {
          chiefComplaint: 'Severe chest pain',
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
        <MemoryRouter initialEntries={['/doctor/cases/doc-kannada-case']}>
          <Routes>
            <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Language View:/i)).toBeInTheDocument();
        expect(screen.getByText(/English \(Canonical\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Patient's Language \(Kannada\)/i)).toBeInTheDocument();
      });
    });

    it('shows Language View toggle for language="Hindi"', async () => {
      localStorage.setItem('medmap_token', 'doctor-jwt-token');

      const mockDoctorCase: any = {
        caseId: 'doc-hindi-case',
        patientId: 'patient-hi',
        status: 'doctor_review',
        language: 'Hindi',
        intakeAnswers: {
          chief_complaint: {
            value: 'Severe chest pain',
            original: 'सीने में तेज दर्द',
            lang: 'hi',
          },
        },
        derivedClinicalData: {
          medicalEntities: { diagnoses: [], medications: [], investigations: [], procedures: [] },
          doctorReviews: {},
        },
        aiSummary: {
          chiefComplaint: 'Severe chest pain',
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
        <MemoryRouter initialEntries={['/doctor/cases/doc-hindi-case']}>
          <Routes>
            <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Language View:/i)).toBeInTheDocument();
        expect(screen.getByText(/English \(Canonical\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Patient's Language \(Hindi\)/i)).toBeInTheDocument();
      });
    });

    it('does NOT show Language View toggle for language="English"', async () => {
      localStorage.setItem('medmap_token', 'doctor-jwt-token');

      const mockDoctorCase: any = {
        caseId: 'doc-english-case',
        patientId: 'patient-en',
        status: 'doctor_review',
        language: 'English',
        intakeAnswers: {
          chief_complaint: {
            value: 'Severe chest pain',
          },
        },
        derivedClinicalData: {
          medicalEntities: { diagnoses: [], medications: [], investigations: [], procedures: [] },
          doctorReviews: {},
        },
        aiSummary: {
          chiefComplaint: 'Severe chest pain',
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
        <MemoryRouter initialEntries={['/doctor/cases/doc-english-case']}>
          <Routes>
            <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Patient Identifier:/i)).toBeInTheDocument();
      });

      expect(screen.queryByText(/Language View:/i)).toBeNull();
    });
  });
});
