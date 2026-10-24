import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PatientWalkthroughModal } from '../components/patient/PatientWalkthroughModal';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import { CaseProvider } from '../context/CaseContext';
import * as api from '../utils/api';

vi.mock('../utils/api');

const ALLOWLIST_TOKENS = ['MedMap', 'ABHA', 'ABDM', 'AI'];

function assertNoEnglishLeaks(container: HTMLElement, contextName: string) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const leaked: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent || '';
    const words = text.match(/[A-Za-z]{3,}/g) || [];
    for (const w of words) {
      if (!ALLOWLIST_TOKENS.includes(w)) {
        leaked.push(w);
      }
    }
    node = walker.nextNode();
  }
  expect(leaked, `English words leaked in ${contextName}: ${leaked.join(', ')}`).toEqual([]);
}

describe('PatientWalkthroughModal & Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders step 1 and navigates through 4 steps with Back/Next', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={onClose} lang="en" />
      </MemoryRouter>
    );

    // Step 1
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByText('How to Answer')).toBeInTheDocument();
    expect(screen.getByText(/type, tap a suggested answer, or press the microphone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();

    // Next -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByText('Listen to Questions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();

    // Back -> Step 1
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();

    // Next -> Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Step 3 of 4')).toBeInTheDocument();
    expect(screen.getByText('Review and Correct')).toBeInTheDocument();

    // Next -> Step 4
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Step 4 of 4')).toBeInTheDocument();
    expect(screen.getByText('Privacy on This Device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();

    // Finish
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('medmap_walkthrough_seen')).toBe('true');
  });

  it('closes on Skip button and persists seen state in sessionStorage', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={onClose} lang="en" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('medmap_walkthrough_seen')).toBe('true');
  });

  it('closes on Escape key press and persists seen state', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={onClose} lang="en" />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('medmap_walkthrough_seen')).toBe('true');
  });

  it('calls synthesizeSpeech on Listen button in Hindi and degrades gracefully', async () => {
    vi.mocked(api.synthesizeSpeech).mockRejectedValue(new Error('TTS offline'));
    render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={vi.fn()} lang="hi" />
      </MemoryRouter>
    );

    const listenBtn = screen.getByRole('button', { name: /सुनें/i });
    expect(listenBtn).toBeInTheDocument();
    fireEvent.click(listenBtn);

    await waitFor(() => {
      expect(api.synthesizeSpeech).toHaveBeenCalledWith(
        expect.stringContaining('उत्तर कैसे दें'),
        'hi'
      );
    });
  });

  it('contains zero Latin character leaks in Hindi', () => {
    const { container } = render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={vi.fn()} lang="hi" />
      </MemoryRouter>
    );
    assertNoEnglishLeaks(container, 'PatientWalkthroughModal (Hindi)');
  });

  it('contains zero Latin character leaks in Kannada', () => {
    const { container } = render(
      <MemoryRouter>
        <PatientWalkthroughModal isOpen={true} onClose={vi.fn()} lang="kn" />
      </MemoryRouter>
    );
    assertNoEnglishLeaks(container, 'PatientWalkthroughModal (Kannada)');
  });

  it('does not display in PatientIntakePage if walkthrough was already seen', async () => {
    sessionStorage.setItem('activeCaseId', 'case-seen');
    sessionStorage.setItem('medmap_walkthrough_seen', 'true');

    vi.mocked(api.getCase).mockResolvedValue({
      caseId: 'case-seen',
      patientId: 'P-101',
      status: 'intake',
      language: 'en',
      intakeAnswers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    vi.mocked(api.getUnifiedCase).mockResolvedValue(null as any);
    vi.mocked(api.getAdaptiveIntakeState).mockResolvedValue({
      state: 'question',
      currentQuestion: {
        id: 'chief_complaint',
        category: 'Chief Complaint',
        prompt: 'What is your symptom?',
        inputType: 'text',
      },
      answeredQuestionIds: [],
      skippedQuestionIds: [],
      irrelevantQuestionIds: [],
      malformedAnswerQuestionIds: [],
    } as any);

    render(
      <MemoryRouter initialEntries={['/patient/intake']}>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('What is your symptom?')).toBeInTheDocument();
    });

    expect(screen.queryByText('Step 1 of 4')).not.toBeInTheDocument();
  });
});
