import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import * as api from '../utils/api';
import { CaseProvider } from '../context/CaseContext';

vi.mock('../utils/api');

describe('AYUSH / Ayurveda Questionnaire & Review Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'test-token');
    sessionStorage.setItem('activeCaseId', 'ayush-case-1');
  });

  it('renders Dashavidha Pariksha question with single-choice options and Not sure', async () => {
    const mockCase: any = {
      caseId: 'ayush-case-1',
      patientId: 'patient-ayush',
      status: 'intake',
      language: 'en-IN',
      consultationType: 'ayush',
      intakeAnswers: {},
    };

    const mockAyushSession: any = {
      state: 'question',
      currentQuestion: {
        id: 'prakriti_vihara',
        prompt: 'How would you describe your natural physical frame, energy rhythm, and lifestyle tendency?',
        category: 'ayush',
        inputType: 'text',
        options: [
          'Lean frame, dry skin, energetic in bursts, light sleeper (Vata tendency)',
          'Medium build, warm body temperature, strong appetite, sharp intellect (Pitta tendency)',
          'Solid/heavy build, smooth oily skin, steady endurance, deep sleeper (Kapha tendency)',
          'Combination of traits',
          'Not sure',
        ],
        helperText: 'Select the profile that best describes your baseline constitution.',
      },
      answeredQuestionIds: [],
      totalEligibleQuestions: 10,
    };

    vi.mocked(api.getCase).mockResolvedValue(mockCase);
    vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue(mockAyushSession);
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
    vi.mocked(api.updateCase).mockResolvedValue({
      ...mockCase,
      intakeAnswers: { prakriti_vihara: 'Not sure' },
    });

    render(
      <MemoryRouter initialEntries={['/patient/intake']}>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/How would you describe your natural physical frame/i)
      ).toBeInTheDocument();
    });

    // Check that options and "Not sure" are present
    expect(screen.getByText(/Lean frame, dry skin/i)).toBeInTheDocument();
    expect(screen.getByText(/Medium build, warm body temperature/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Not sure$/i })).toBeInTheDocument();

    // Select an option
    const notSureButton = screen.getByRole('button', { name: /^Not sure$/i });
    fireEvent.click(notSureButton);

    // Verify option selection triggered updateCase
    await waitFor(() => {
      expect(api.updateCase).toHaveBeenCalledWith(
        'ayush-case-1',
        expect.objectContaining({
          intakeAnswers: expect.objectContaining({ prakriti_vihara: 'Not sure' }),
        })
      );
    });
  });

  it('displays Ayurveda history section in doctor view with required expert review disclaimer', async () => {
    const mockDoctorCase: any = {
      caseId: 'ayush-case-1',
      patientId: 'patient-ayush',
      status: 'doctor_review',
      language: 'en-IN',
      consultationType: 'ayush',
      intakeAnswers: {
        ayush: {
          prakriti: 'Pitta tendency (warm, strong appetite, sharp intellect)',
          agni: 'Tikshnagni (sharp, intense appetite; skips meals with headaches)',
          koshtha: 'Madhyama (moderate, normal bowel habits)',
        },
      },
      derivedClinicalData: {
        medicalEntities: {
          diagnoses: ['Hyperacidity (Amlapitta)'],
          medications: [],
          investigations: [],
          procedures: [],
        },
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
      <MemoryRouter initialEntries={['/doctor/cases/ayush-case-1']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Ayurveda History \(Dashavidha Pariksha\)/i)).toBeInTheDocument();
    });

    // Verify required disclaimer is visibly displayed
    expect(
      screen.getByText(/Draft questionnaire: requires review by a qualified Ayurvedic practitioner\./i)
    ).toBeInTheDocument();

    // Verify self-reported answers are shown grouped under parameters without a fake diagnosis
    expect(screen.getByText(/Tikshnagni/i)).toBeInTheDocument();
    expect(screen.getByText(/Madhyama/i)).toBeInTheDocument();
    expect(screen.getByText(/Pitta tendency/i)).toBeInTheDocument();
  });
});
