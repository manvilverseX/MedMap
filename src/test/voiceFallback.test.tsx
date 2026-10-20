import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

class MockMediaRecorder {
  state = 'inactive';
  stream: any;
  options: any;
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  static isTypeSupported = vi.fn((_type: string) => true);
  static lastInstance: MockMediaRecorder | null = null;

  constructor(stream: any, options: any) {
    this.stream = stream;
    this.options = options;
    MockMediaRecorder.lastInstance = this;
  }

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['mock-audio'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

describe('Voice and touch fallback logic (Web Speech + Server-Side Speech)', () => {
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

  let mockAudioInstance: any;

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
    delete (window as any).SpeechSynthesisUtterance;
    MockSpeechRecognition.lastInstance = null;
    MockMediaRecorder.lastInstance = null;

    (window as any).MediaRecorder = MockMediaRecorder;

    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      voice = null;
      onstart: any = null;
      onend: any = null;
      onerror: any = null;
      constructor(text: string) {
        this.text = text;
      }
    };

    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    // Mock Audio constructor
    mockAudioInstance = {
      src: '',
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      currentTime: 0,
      onplay: null,
      onended: null,
      onerror: null,
    };
    (window as any).Audio = function () {
      return mockAudioInstance;
    };

    // Mock URL.createObjectURL
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-audio-url');
    } else {
      vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock-audio-url');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays graceful fallback when browser lacks SpeechRecognition (English)', async () => {
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

  it('handles microphone permission denied error gracefully for English Web Speech API', async () => {
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

    const micButton = await screen.findByRole('button', { name: /Tap to speak/i });
    fireEvent.click(micButton);

    const instance = MockSpeechRecognition.lastInstance;
    expect(instance).not.toBeNull();

    // Trigger permission denied error
    act(() => {
      instance?.onerror?.({ error: 'not-allowed' });
    });

    await waitFor(() => {
      const msgs = screen.getAllByText(/Microphone permission denied\. You can continue by typing or choosing options below\./i);
      expect(msgs.length).toBeGreaterThan(0);
    });
  });

  it('uses Web Speech API SpeechRecognition for English with en-IN', async () => {
    (window as any).SpeechRecognition = MockSpeechRecognition;

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const micButton = await screen.findByRole('button', { name: /Tap to speak/i });
    fireEvent.click(micButton);

    const instance = MockSpeechRecognition.lastInstance;
    expect(instance?.lang).toBe('en-IN');
  });

  it('calls server-side TTS for Kannada, plays audio, and uses in-memory cache on repeat', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    vi.mocked(api.synthesizeSpeech).mockResolvedValue(new Blob(['fake-audio-bytes'], { type: 'audio/wav' }));

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const readAloudBtn = await screen.findByRole('button', { name: /ಓದಿ ಹೇಳಿ|Read Aloud/i });
    expect(readAloudBtn).toBeInTheDocument();

    // First click: calls backend TTS
    await act(async () => {
      fireEvent.click(readAloudBtn);
    });

    expect(api.synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(api.synthesizeSpeech).toHaveBeenCalledWith(
      expect.stringContaining('What brings you to see the doctor today?'),
      'kn'
    );
    expect(mockAudioInstance.play).toHaveBeenCalledTimes(1);

    // Second click: stops speaking
    act(() => {
      if (mockAudioInstance.onplay) mockAudioInstance.onplay();
    });
    fireEvent.click(readAloudBtn);
    expect(mockAudioInstance.pause).toHaveBeenCalled();

    act(() => {
      if (mockAudioInstance.onended) mockAudioInstance.onended();
    });

    // Third click (replay same question): hits in-memory cache and does NOT call synthesizeSpeech again
    await act(async () => {
      fireEvent.click(readAloudBtn);
    });
    expect(api.synthesizeSpeech).toHaveBeenCalledTimes(1); // Cached!
    expect(mockAudioInstance.play).toHaveBeenCalledTimes(2);
  });

  it('falls back to browser speechSynthesis if server-side TTS fails and matching voice exists', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    vi.mocked(api.synthesizeSpeech).mockRejectedValue(new Error('Server unavailable'));

    const mockSpeak = vi.fn();
    (window as any).speechSynthesis = {
      getVoices: () => [{ lang: 'kn-IN', name: 'Kannada Voice' }],
      speak: mockSpeak,
      cancel: vi.fn(),
      onvoiceschanged: null,
    };

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const readAloudBtn = await screen.findByRole('button', { name: /ಓದಿ ಹೇಳಿ|Read Aloud/i });
    await act(async () => {
      fireEvent.click(readAloudBtn);
    });

    expect(api.synthesizeSpeech).toHaveBeenCalledWith(expect.any(String), 'kn');
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('displays clear message if server-side TTS fails and no matching browser voice exists', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    vi.mocked(api.synthesizeSpeech).mockRejectedValue(new Error('TTS 503 error'));

    (window as any).speechSynthesis = {
      getVoices: () => [{ lang: 'en-US', name: 'English Voice' }], // No kn voice
      speak: vi.fn(),
      cancel: vi.fn(),
      onvoiceschanged: null,
    };

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const readAloudBtn = await screen.findByRole('button', { name: /ಓದಿ ಹೇಳಿ|Read Aloud/i });
    await act(async () => {
      fireEvent.click(readAloudBtn);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/ಧ್ವನಿ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ|ಆಡಿಯೋ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ|Audio is unavailable right now/i)
      ).toBeInTheDocument();
    });
  });

  it('records audio with MediaRecorder for Kannada, sends to STT, populates editable textbox without auto-submitting, and shows notice', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    vi.mocked(api.transcribeSpeech).mockResolvedValue({
      transcript: 'ತೀವ್ರ ಜ್ವರ ಮತ್ತು ತಲೆನೋವು',
    });

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const micBtn = await screen.findByRole('button', { name: /ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ \(Kannada\)|Tap to Speak \(Kannada\)/i });
    expect(micBtn).toBeInTheDocument();

    // Tap to start recording
    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(MockMediaRecorder.lastInstance).not.toBeNull();
    expect(MockMediaRecorder.lastInstance?.state).toBe('recording');

    // Tap to stop recording
    await act(async () => {
      MockMediaRecorder.lastInstance?.stop();
    });

    // Check that transcribeSpeech was called with language 'kn'
    expect(api.transcribeSpeech).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.(webm|mp4)$/), 'kn');

    // Check that the transcript is placed into the input box
    await waitFor(() => {
      const input = screen.getByLabelText(/What brings you to see the doctor today/i) as HTMLInputElement;
      expect(input.value).toBe('ತೀವ್ರ ಜ್ವರ ಮತ್ತು ತಲೆನೋವು');
    });

    // Verify AI transcription notice is displayed
    expect(screen.getByText(/AI ಪ್ರತಿಲೇಖನ|AI transcription/i)).toBeInTheDocument();

    // Verify that it did NOT auto-submit (continue button is enabled for user review)
    const continueBtn = screen.getByRole('button', { name: /ಮುಂದುವರಿಯಿರಿ|Continue/i });
    expect(continueBtn).not.toBeDisabled();
    expect(api.updateCase).not.toHaveBeenCalled();

    // User can edit the transcript
    const input = screen.getByLabelText(/What brings you to see the doctor today/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ತೀವ್ರ ಜ್ವರ' } });
    expect(input.value).toBe('ತೀವ್ರ ಜ್ವರ');

    // When user manually clicks Continue, updateCase is called with the answer
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    expect(api.updateCase).toHaveBeenCalledWith('test-case-123', {
      intakeAnswers: { chief_complaint: 'ತೀವ್ರ ಜ್ವರ' },
    });
  });

  it('handles microphone permission denied for Kannada/Hindi', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    const permError = new Error('Permission denied');
    permError.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(permError);

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const micBtn = await screen.findByRole('button', { name: /ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ \(Kannada\)|Tap to Speak \(Kannada\)/i });
    await act(async () => {
      fireEvent.click(micBtn);
    });

    await waitFor(() => {
      const msgs = screen.getAllByText(/ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ|Microphone permission denied/i);
      expect(msgs.length).toBeGreaterThan(0);
    });
  });

  it('handles no microphone found for Kannada/Hindi', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    const deviceError = new Error('Device not found');
    deviceError.name = 'NotFoundError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(deviceError);

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const micBtn = await screen.findByRole('button', { name: /ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ \(Kannada\)|Tap to Speak \(Kannada\)/i });
    await act(async () => {
      fireEvent.click(micBtn);
    });

    await waitFor(() => {
      const msgs = screen.getAllByText(/ಈ ಸಾಧನದಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಕಂಡುಬಂದಿಲ್ಲ|No microphone detected/i);
      expect(msgs.length).toBeGreaterThan(0);
    });
  });

  it('handles backend STT service error for Kannada/Hindi', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...mockCase,
      language: 'kn',
    });
    vi.mocked(api.transcribeSpeech).mockRejectedValueOnce(new Error('STT service unavailable'));

    render(
      <BrowserRouter>
        <CaseProvider>
          <PatientIntakePage />
        </CaseProvider>
      </BrowserRouter>
    );

    const micBtn = await screen.findByRole('button', { name: /ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ \(Kannada\)|Tap to Speak \(Kannada\)/i });
    await act(async () => {
      fireEvent.click(micBtn);
    });

    await act(async () => {
      MockMediaRecorder.lastInstance?.stop();
    });

    await waitFor(() => {
      const msgs = screen.getAllByText(/ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಸೇವೆಯಲ್ಲಿ ದೋಷ|Could not reach voice service|voice service error/i);
      expect(msgs.length).toBeGreaterThan(0);
    });
  });
});
