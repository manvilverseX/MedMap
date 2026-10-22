import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PatientIntakePage } from '../pages/patient/PatientIntakePage';
import { interpolate } from '../i18n/strings';

import { CaseProvider } from '../context/CaseContext';
import { setSessionLanguage } from '../utils/language';

vi.mock('../utils/api', () => ({
  API_BASE_URL: 'http://localhost:8000/api/v1',
  getCase: vi.fn(),
  updateCase: vi.fn(),
  getAdaptiveIntakeState: vi.fn(),
  getUnifiedCase: vi.fn().mockResolvedValue(null),
}));

import { getCase, getAdaptiveIntakeState } from '../utils/api';

describe('Placeholder leakage & tolerant interpolation', () => {
  it('never outputs raw {{ or }} or {total} or {n} when vars are missing or partial', () => {
    const templates = [
      'Point {{current}} of ~{{total}}',
      'बिंदु {{current}} / लगभग {{total}}',
      'ಹಂತ {{current}} / ಸುಮಾರು {{total}}',
      'Question {{index}} of {{total}}',
      'Domain: {{domain}} ({{resolved}}/{{total}} resolved)',
      'Recording ({{seconds}}s)... Tap to Stop',
      'Case {{id}}',
      'You mentioned {total} items and {n} medications',
    ];

    for (const tmpl of templates) {
      // 1. No vars passed
      const resEmpty = interpolate(tmpl, {});
      expect(resEmpty).not.toContain('{{');
      expect(resEmpty).not.toContain('}}');
      expect(resEmpty).not.toContain('{total}');
      expect(resEmpty).not.toContain('{n}');
      expect(resEmpty).not.toContain('/ लगभग');
      expect(resEmpty).not.toContain('/ ಸುಮಾರು');

      // 2. Only current/index passed, total undefined
      const resPartial = interpolate(tmpl, { current: 1, index: 1 });
      expect(resPartial).not.toContain('{{');
      expect(resPartial).not.toContain('}}');
      expect(resPartial).not.toContain('{total}');
      expect(resPartial).not.toContain('{n}');
      expect(resPartial).not.toContain('/ लगभग');
      expect(resPartial).not.toContain('/ ಸುಮಾರು');

      // 3. With all vars
      const resFull = interpolate(tmpl, { current: 1, total: 5, index: 1, domain: 'Cardio', resolved: 2, seconds: 15, id: '123', n: 3 });
      expect(resFull).not.toContain('{{');
      expect(resFull).not.toContain('}}');
      expect(resFull).not.toContain('{total}');
      expect(resFull).not.toContain('{n}');
    }
  });

  it('renders PatientIntakePage in Hindi without any placeholder leaks or duplicate category', async () => {
    const mockCase = {
      caseId: 'case-test-hi',
      patientId: 'p-1',
      language: 'Hindi',
      status: 'intake',
      intakeAnswers: {},
    };

    const mockAdaptiveState = {
      state: 'question',
      currentQuestion: {
        id: 'chief_complaint',
        category: 'Chief Complaint',
        categoryLocalized: 'मुख्य शिकायत',
        prompt: 'What is the main reason for your visit today?',
        promptLocalized: 'आज आपके आने का मुख्य कारण क्या है?',
        helperText: 'Describe your primary concern.',
        helperTextLocalized: 'अपनी प्राथमिक चिंता का संक्षेप में वर्णन करें।',
        inputType: 'text',
        options: ['Fever or chills', 'Headache or migraine'],
        optionsLocalized: ['बुखार या ठंड लगना', 'सिरदर्द या माइग्रेन'],
      },
      answeredQuestionIds: [],
      skippedQuestionIds: [],
      irrelevantQuestionIds: [],
      malformedAnswerQuestionIds: [],
      totalEligibleQuestions: 8,
      currentQuestionIndex: 1,
      clinicalProgress: {
        domainsExplored: [],
        activeDomain: 'Chief Complaint',
        activeDomainLocalized: 'मुख्य शिकायत',
        questionsAnswered: 0,
        coverageStatus: 'in_progress',
        unresolvedGapsCount: 8,
        totalRelevantGaps: null, // intentionally null/adaptive
        resolvedGaps: 0,
      },
      translated: true,
      translationLang: 'hi',
    };

    setSessionLanguage('Hindi');
    sessionStorage.setItem('activeCaseId', 'case-test-hi');
    (getCase as any).mockResolvedValue(mockCase);
    (getAdaptiveIntakeState as any).mockResolvedValue(mockAdaptiveState);

    const { container } = render(
      <MemoryRouter initialEntries={['/patient/intake/case-test-hi']}>
        <CaseProvider>
          <Routes>
            <Route path="/patient/intake/:caseId" element={<PatientIntakePage />} />
          </Routes>
        </CaseProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('आज आपके आने का मुख्य कारण क्या है?')).toBeInTheDocument();
    });

    const bodyText = container.textContent || '';
    expect(bodyText).not.toContain('{{');
    expect(bodyText).not.toContain('}}');
    expect(bodyText).not.toContain('{total}');
    expect(bodyText).not.toContain('{n}');
    expect(bodyText).not.toContain('/ लगभग');
    expect(bodyText).not.toContain('बिंदु 1 / लगभग {{total}}');

    // Assert banner "Translation unavailable, showing English" does NOT appear
    expect(bodyText).not.toContain('Translation unavailable, showing English');
    expect(bodyText).not.toContain('अनुवाद उपलब्ध नहीं है');

    // Assert chips are localized
    expect(screen.getByText('बुखार या ठंड लगना')).toBeInTheDocument();
    expect(screen.getByText('सिरदर्द या माइग्रेन')).toBeInTheDocument();

    // Assert progress shows point without duplicate category
    const progressHeader = container.querySelector('.intake-progress-header');
    expect(progressHeader).toBeInTheDocument();
    expect(progressHeader?.textContent).toContain('मुख्य शिकायत');
    expect(progressHeader?.textContent).toContain('(बिंदु 1)');
  });
});
