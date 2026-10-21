import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CaseProvider } from '../context/CaseContext';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import * as api from '../utils/api';

vi.mock('../utils/api');

const mockCase: any = {
  caseId: 'test-case-123',
  patientId: 'PAT-101',
  status: 'intake',
  language: 'kn',
  intakeAnswers: {
    chief_complaint: 'Severe headache for 2 days',
  },
};

const mockQuestion1: any = {
  state: 'question',
  answeredQuestionIds: ['chief_complaint'],
  skippedQuestionIds: [],
  irrelevantQuestionIds: [],
  malformedAnswerQuestionIds: [],
  currentQuestion: {
    id: 'fever_check',
    category: 'History of Present Illness',
    prompt: 'Do you also have a fever?',
    inputType: 'text',
    options: ['Yes', 'No', 'Not sure'],
  },
};

describe('Intake Robustness and Question Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('activeCaseId', 'test-case-123');
    localStorage.setItem('medmap_token', 'fake-token');
    vi.mocked(api.getCase).mockResolvedValue(mockCase);
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
  });

  it('shows a Try again button for a failed question load, keeps previous answers, and does not reset the case', async () => {
    // 1. Initial question load fails
    vi.mocked(api.getAdaptiveIntakeState)
      .mockRejectedValueOnce(new Error('Network glitch or 503'))
      .mockResolvedValueOnce(mockQuestion1);

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    // Should show error card with "Try again"
    const retryBtn = await screen.findByRole('button', { name: /try again|ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ/i });
    expect(retryBtn).toBeInTheDocument();
    expect(screen.getByText(/failed to load question\. please try again\.|ಪ್ರಶ್ನೆಯನ್ನು ಲೋಡ್ ಮಾಡಲು ವಿಫಲವಾಗಿದೆ/i)).toBeInTheDocument();

    // getCase should only have been called ONCE for the initial load
    expect(api.getCase).toHaveBeenCalledTimes(1);

    // Click "Try again"
    fireEvent.click(retryBtn);

    // Should load the question on retry without re-fetching getCase (no reset of case)
    await waitFor(() => {
      expect(screen.getByText('Do you also have a fever?')).toBeInTheDocument();
    });

    // Verify getCase was NOT called again — the case was not reset!
    expect(api.getCase).toHaveBeenCalledTimes(1);
    // getAdaptiveIntakeState was retried
    expect(api.getAdaptiveIntakeState).toHaveBeenCalledTimes(2);
  });

  it('shows inline Try again when answering a question encounters a question load failure and keeps patient answers', async () => {
    vi.mocked(api.getAdaptiveIntakeState)
      .mockResolvedValueOnce(mockQuestion1)
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValueOnce({
        ...mockQuestion1,
        currentQuestion: {
          id: 'next_question',
          category: 'Review of Systems',
          prompt: 'Any nausea or vomiting?',
          inputType: 'text',
        },
      });

    vi.mocked(api.updateCase).mockResolvedValue({
      ...mockCase,
      intakeAnswers: {
        chief_complaint: 'Severe headache for 2 days',
        fever_check: 'Yes',
      },
    });

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    await screen.findByText('Do you also have a fever?');

    // Click "Yes" option pill
    const yesBtn = screen.getByRole('button', { name: 'Yes' });
    fireEvent.click(yesBtn);

    // updateCase was called with the answer
    await waitFor(() => {
      expect(api.updateCase).toHaveBeenCalled();
    });

    // Question load failed on next question -> shows "Try again"
    const retryBtn = await screen.findByRole('button', { name: /try again|ಮತ್ತೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ/i });
    expect(retryBtn).toBeInTheDocument();

    // Click "Try again"
    fireEvent.click(retryBtn);

    // Next question loads
    await waitFor(() => {
      expect(screen.getByText('Any nausea or vomiting?')).toBeInTheDocument();
    });
  });
});
