import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PatientVerificationPage } from '../pages/patient/PatientVerificationPage';
import { InactivityCountdownBanner } from '../components/patient/InactivityCountdownBanner';
import * as api from '../utils/api';
import { CaseProvider } from '../context/CaseContext';

vi.mock('../utils/api');

describe('Session Clearing and Shared Device Privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('activeCaseId', 'case-verify-privacy');
    localStorage.setItem('medmap_token', 'patient-jwt-session');
  });

  it('renders Finish & Clear This Device button after confirmation and cleans up session on click', async () => {
    const confirmedCase: any = {
      caseId: 'case-verify-privacy',
      patientId: 'patient-session-1',
      status: 'doctor_review', // already confirmed
      language: 'en',
      consultationType: 'general',
      intakeAnswers: {
        chief_complaint: 'Chronic migraine headaches',
      },
      derivedClinicalData: {
        structuredIntake: {
          chief_complaint: { prompt: 'Chief Complaint', active: true },
        },
      },
    };

    vi.mocked(api.getCase).mockResolvedValue(confirmedCase);
    vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
    vi.mocked(api.logout).mockResolvedValue();

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientVerificationPage />
        </CaseProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Information Verified/i)).toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /Finish & Clear This Device/i });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(api.logout).toHaveBeenCalledTimes(1);
    });
  });

  it('InactivityCountdownBanner warns user and triggers clear on click or timeout', async () => {
    const onClearDevice = vi.fn();

    render(
      <InactivityCountdownBanner
        timeoutSeconds={300}
        warningThresholdSeconds={300}
        onClearDevice={onClearDevice}
      />
    );

    // Warning banner should be rendered
    expect(
      screen.getByText(/Shared Device Inactivity Warning/i)
    ).toBeInTheDocument();

    // Clicking "Clear Device Now" triggers the callback immediately
    const clearNowBtn = screen.getByRole('button', { name: /Clear Device Now/i });
    fireEvent.click(clearNowBtn);

    expect(onClearDevice).toHaveBeenCalledTimes(1);
  });
});
