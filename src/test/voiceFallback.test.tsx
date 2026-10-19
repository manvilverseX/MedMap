import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import * as api from '../utils/api';
import { CaseProvider } from '../context/CaseContext';

vi.mock('../utils/api');

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = '';
  onstart: (() => void) | null = null;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;

  static lastInstance: MockSpeechRecognition | null = null;

  constructor() {
    MockSpeechRecognition.lastInstance = this;
  }

  start() {
    if (this.onstart) this.onstart();
  }
  stop() {
    if (this.onend) this.onend();
  }
  abort() {
    if (this.onend) this.onend();
  }
}

describe('Voice and touch fallback logic', () => {
  const mockCase: any = {
    caseId: 'test-case-123',
    patientId: 'patient-123',
    status: 'intake',
    language: 'en-IN',
    consultationType: 'general',
    intakeAnswers: {},
  };

  const mockSession: any = {
    state: 'question',
    currentQuestion: {
      id: 'chief_complaint',
      prompt: 'What brings you to see the doctor today?',
      category: 'chief_complaint',
      inputType: 'text',
      helperText: 'Describe your main symptoms.',
    },
    answeredQuestionIds: [],
    totalEligibleQuestions: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem('activeCaseId', 'test-case-123');
    localStorage.setItem('medmap_token', 'fake-token');

    vi.mocked(api.getCase).mockResolvedValue(mockCase);
    vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue(mockSession);
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
    vi.mocked(api.updateCase).mockResolvedValue({
      ...mockCase,
      intakeAnswers: { chief_complaint: 'Headache' },
    });

    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    delete (window as any).speechSynthesis;
    MockSpeechRecognition.lastInstance = null;
  });

  it('displays graceful fallback when browser lacks SpeechRecognition', async () => {
    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/What brings you to see the doctor today/i)).toBeInTheDocument();
    });

    const voiceToggle = screen.getByRole('button', { name: /Voice Mode/i });
    expect(voiceToggle).toHaveTextContent(/Voice Mode: OFF/i);

    fireEvent.click(voiceToggle);
    expect(voiceToggle).toHaveTextContent(/Voice Mode: ON/i);

    expect(screen.getByText(/browser-based speech \(Web Speech API\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Speech recognition not supported in this browser\. Please use touch or typing below\./i)
    ).toBeInTheDocument();
  });

  it('handles microphone permission denied error gracefully', async () => {
    (window as any).SpeechRecognition = MockSpeechRecognition;

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/What brings you to see the doctor today/i)).toBeInTheDocument();
    });

    const voiceToggle = screen.getByRole('button', { name: /Voice Mode/i });
    fireEvent.click(voiceToggle);

    const micButton = screen.getByRole('button', { name: /Tap to speak/i });
    fireEvent.click(micButton);

    const instance = MockSpeechRecognition.lastInstance;
    expect(instance).not.toBeNull();

    // Trigger permission denied error
    instance?.onerror?.({ error: 'not-allowed' });

    await waitFor(() => {
      expect(
        screen.getByText(/Microphone permission denied\. You can continue by typing or choosing options below\./i)
      ).toBeInTheDocument();
    });
  });

  it('sets correct speech language codes for Hindi and Kannada', async () => {
    (window as any).SpeechRecognition = MockSpeechRecognition;

    vi.mocked(api.getCase).mockResolvedValueOnce({
      ...mockCase,
      language: 'hi',
    });

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/What brings you to see the doctor today/i)).toBeInTheDocument();
    });

    const voiceToggle = screen.getByRole('button', { name: /Voice Mode/i });
    fireEvent.click(voiceToggle);

    const micButton = screen.getByRole('button', { name: /Tap to speak/i });
    fireEvent.click(micButton);

    const instance = MockSpeechRecognition.lastInstance;
    expect(instance?.lang).toBe('hi-IN');
  });
});
