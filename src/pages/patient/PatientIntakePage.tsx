import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { getCase, updateCase, getAdaptiveIntakeState, getUnifiedCase, synthesizeSpeech, transcribeSpeech, mapApiErrorToKey } from '../../utils/api';
import type { ClinicalCase } from '../../types/case';
import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LoadingIndicator } from '../../components/LoadingIndicator';
import { StatusBadge } from '../../components/StatusBadge';
import { useT } from '../../i18n/useT';
import { normalizeLanguage, setSessionLanguage, formatDate } from '../../utils/language';
import './PatientIntakePage.css';

interface IntakeQuestion {
  id: string;
  category: string;
  categoryLocalized?: string;
  prompt: string;
  promptLocalized?: string;
  helperText?: string;
  helperTextLocalized?: string;
  inputType: 'text' | 'textarea';
  options?: string[];
  optionsLocalized?: string[];
  clarificationOptions?: string[];
  clarificationOptionsLocalized?: string[];
  isOptional?: boolean;
  allowsNone?: boolean;
}

interface IntakeSessionState {
  state: 'question' | 'clarification' | 'correction' | 'complete' | 'safety_escalation' | 'incomplete';
  currentQuestion?: IntakeQuestion;
  issue?: string;
  issueLocalized?: string | null;
  previousQuestionId?: string | null;
  originalAnswer?: string | null;
  clarificationAttempts?: number;
  totalEligibleQuestions?: number;
  currentQuestionIndex?: number;
  allowUncertainty?: boolean;
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];
  irrelevantQuestionIds: string[];
  malformedAnswerQuestionIds: string[];
  translated?: boolean;
  translationLang?: string;
  translationFallbackNotice?: string | null;
  aiTranslationTag?: string | null;
  safetyEscalation?: {
    triggered: boolean;
    severity: 'emergency' | 'urgent';
    headline: string;
    reason: string;
    guidance: string;
    redFlagsDetected: string[];
    suggestedAction: string;
  };
  clinicalProgress?: {
    stage?: string;
    activeDomain?: string;
    activeDomainLocalized?: string;
    exploredDomains?: string[];
    domainsExplored?: string[];
    domainsExploredLocalized?: string[];
    totalRelevantGaps?: number;
    resolvedGaps?: number;
  };
}

export function PatientIntakePage() {
  const { caseId } = useCase();
  const navigate = useNavigate();

  // ── Case loading state ────────────────────────────────────────────────
  const [clinicalCase, setClinicalCase] = useState<ClinicalCase | null>(null);
  const [unifiedCase, setUnifiedCase] = useState<any>(null);
  const [showLongitudinalPrompt, setShowLongitudinalPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Adaptive Intake state ──────────────────────────────────────────────
  const [sessionState, setSessionState] = useState<IntakeSessionState | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<{ message: string; retry: () => void } | null>(null);

  // ── Voice & Audio state ────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [micRecordState, setMicRecordState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showAiTranscriptionNotice, setShowAiTranscriptionNotice] = useState(false);

  const [pendingCriticalConfirmation, setPendingCriticalConfirmation] = useState<{
    answer: string;
    questionId: string;
    category: string;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioCache = useRef<Map<string, string>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // ── i18n & Language state ───────────────────────────────────────────
  const { t } = useT(clinicalCase?.language);

  // Speech language mapping (en-IN, hi-IN, kn-IN)
  const normLang = normalizeLanguage(clinicalCase?.language);
  const speechLang = normLang === 'hi' ? 'hi-IN' : normLang === 'kn' ? 'kn-IN' : 'en-IN';
  const isIndicLang = normLang === 'kn' || normLang === 'hi';
  const speechLangName = normLang === 'hi' ? 'हिंदी' : normLang === 'kn' ? 'ಕನ್ನಡ' : 'English';

  const [hasVoiceForLang, setHasVoiceForLang] = useState(true);

  // Check if Web Speech voice is available for non-English speechLang
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const checkVoice = () => {
      const targetPrefix = speechLang.slice(0, 2).toLowerCase();
      if (targetPrefix === 'en') {
        setHasVoiceForLang(true);
        return;
      }
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) {
        return;
      }
      const found = voices.some((v) =>
        v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
      );
      setHasVoiceForLang(found);
    };

    checkVoice();
    window.speechSynthesis.onvoiceschanged = checkVoice;
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [speechLang]);

  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const hasSpeechRecognition = !!SpeechRecognitionAPI;
  const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const hasBrowserVoiceForLang = useCallback((targetLang: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return false;
    const prefix = targetLang.slice(0, 2).toLowerCase();
    return voices.some((v) =>
      v.lang.toLowerCase().replace('_', '-').startsWith(prefix)
    );
  }, []);

  const speakWithBrowser = useCallback((text: string, lang: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voices = window.speechSynthesis.getVoices();
      const targetPrefix = lang.slice(0, 2).toLowerCase();
      const matchingVoice = voices.find((v) =>
        v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
    setIsSpeaking(false);
    setIsAudioLoading(false);
  }, []);

  const playAudioUrl = useCallback((url: string) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }
    const player = audioPlayerRef.current;
    player.src = url;
    player.onplay = () => setIsSpeaking(true);
    player.onended = () => setIsSpeaking(false);
    player.onerror = () => {
      setIsSpeaking(false);
      setAudioError(t('audioUnavailable'));
    };
    player.play().catch((err) => {
      setIsSpeaking(false);
      const msg = err?.message || 'Playback blocked';
      setAudioError(`${t('audioUnavailable')}: ${msg}`);
    });
  }, [t]);

  const speakQuestion = useCallback(async (customText?: string) => {
    stopSpeaking();
    setAudioError(null);
    const promptText = sessionState?.currentQuestion?.promptLocalized || sessionState?.currentQuestion?.prompt || '';
    const helperText = sessionState?.currentQuestion?.helperTextLocalized || sessionState?.currentQuestion?.helperText || '';
    let text = (customText || (promptText ? `${promptText}. ${helperText}` : '')).trim();
    if (!text) return;
    if (text.length > 450) {
      const match = text.slice(0, 450).match(/(.*[.!?।|])\s*/);
      text = match ? match[1].trim() : text.slice(0, 450).trim();
    }

    if (isIndicLang) {
      const cacheKey = `${normLang}:${text}`;
      const cachedUrl = ttsAudioCache.current.get(cacheKey);
      if (cachedUrl) {
        playAudioUrl(cachedUrl);
        return;
      }

      setIsAudioLoading(true);
      try {
        const audioBlob = await synthesizeSpeech(text, normLang);
        const audioUrl = URL.createObjectURL(audioBlob);
        ttsAudioCache.current.set(cacheKey, audioUrl);
        setIsAudioLoading(false);
        playAudioUrl(audioUrl);
      } catch (err: any) {
        setIsAudioLoading(false);
        if (hasBrowserVoiceForLang(speechLang)) {
          speakWithBrowser(text, speechLang);
        } else {
          const detail = err?.message ? `: ${err.message}` : '';
          setAudioError(`${t('audioUnavailable')}${detail}`);
        }
      }
    } else {
      if (!hasVoiceForLang) return;
      speakWithBrowser(text, speechLang);
    }
  }, [sessionState?.currentQuestion, speechLang, normLang, isIndicLang, stopSpeaking, playAudioUrl, hasBrowserVoiceForLang, speakWithBrowser, hasVoiceForLang, t]);

  // ── English Web Speech API Listening ──────────────────────────────────
  const startListening = () => {
    if (!SpeechRecognitionAPI) {
      setSpeechError(t('micNoSupport'));
      return;
    }
    setSpeechError(null);
    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = speechLang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const recognized = (final || interim).trim();
        if (recognized) {
          setSpeechTranscript(recognized);
          setCurrentAnswer(recognized);
          setValidationError(null);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError(t('micDenied'));
        } else if (event.error === 'no-speech') {
          setSpeechError(t('micNoSpeech'));
        } else {
          setSpeechError(`Speech recognition notice (${event.error}). Please use touch or typing.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('Unable to start microphone. Please check your browser audio settings.');
    }
  };

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
    }
  }, []);

  // ── Indic MediaRecorder + Server-Side STT ────────────────────────────
  const stopServerSideRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
  }, []);

  const startServerSideRecording = useCallback(async () => {
    setSpeechError(null);
    setShowAiTranscriptionNotice(false);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setSpeechError(t('micNoSupport'));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setSpeechError(t('micDenied'));
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setSpeechError(t('micNoDevice'));
      } else {
        setSpeechError(t('micServiceError'));
      }
      return;
    }
    mediaStreamRef.current = stream;

    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
    }

    try {
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        stream.getTracks().forEach((track) => {
          try { track.stop(); } catch {}
        });

        const chunks = audioChunksRef.current;
        if (!chunks || chunks.length === 0) {
          setMicRecordState('idle');
          setRecordingSeconds(0);
          return;
        }

        setMicRecordState('transcribing');
        const recordedBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `recording.${ext}`;

        try {
          const result = await transcribeSpeech(recordedBlob, filename, normLang);
          const transcript = (result?.transcript || '').trim();
          if (transcript) {
            setSpeechTranscript(transcript);
            setCurrentAnswer(transcript);
            setValidationError(null);
            setShowAiTranscriptionNotice(true);
          } else {
            setSpeechError(t('micNoSpeech'));
          }
        } catch {
          setSpeechError(t('micServiceError'));
        } finally {
          setMicRecordState('idle');
          setRecordingSeconds(0);
        }
      };

      mediaRecorder.start(250);
      setMicRecordState('recording');
      setRecordingSeconds(0);

      let elapsed = 0;
      recordingTimerRef.current = setInterval(() => {
        elapsed += 1;
        setRecordingSeconds(elapsed);
        if (elapsed >= 30) {
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
          }
          if (mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch {}
          }
        }
      }, 1000);
    } catch {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      setSpeechError(t('micServiceError'));
    }
  }, [normLang, t]);


  const isCriticalQuestion = (questionId?: string) => {
    if (!questionId) return false;
    const q = questionId.toLowerCase();
    return q.includes('allerg') || q.includes('medicat') || q.includes('medicine');
  };

  /**
   * Returns true when a freetext answer consists entirely of non-alphanumeric
   * characters (e.g. ".", "...", "!?!") and is therefore meaningless.
   * Mirrors the server-side check in validate_clinical_answer.
   * Only applied to text / textarea inputs; option-pill selections are always valid.
   */
  const isMeaninglessTextAnswer = (value: string): boolean => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) return false;

    // Allowed legitimate short direct answers (including negative "none" answers)
    const allowed = new Set([
      "no", "none", "yes", "n/a", "na", "nil", "nothing", "never",
      "no symptoms", "no other symptoms", "no associated symptoms",
      "no known allergies", "no allergies", "no prior medical conditions", "no previous surgeries",
      "not sure", "dont know", "don't know", "unsure", "unknown",
      "ಇಲ್ಲ", "ಗೊತ್ತಿಲ್ಲ", "ಯಾವುದೂ ಇಲ್ಲ", "ಹೌದು", "ತಿಳಿದಿಲ್ಲ", "ಯಾವುದೇ ಲಕ್ಷಣಗಳಿಲ್ಲ", "ಏನೂ ಇಲ್ಲ", "ಯಾವ ಲಕ್ಷಣವೂ ಇಲ್ಲ", "ಯಾವುದೇ ಇತರ ಲಕ್ಷಣಗಳಿಲ್ಲ",
      "नहीं", "पता नहीं", "कुछ नहीं", "हाँ", "मालूम नहीं", "ना", "कोई लक्षण नहीं", "नहीं है", "कोई अन्य लक्षण नहीं", "कोई नहीं",
      "nahi", "nahin", "kuch nahi", "kuch nahin", "koi nahi", "koi lakshan nahi", "illa", "yavude illa", "enu illa"
    ]);
    if (allowed.has(trimmed)) return false;
    const cleanAlpha = trimmed.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (allowed.has(cleanAlpha)) return false;
    if (/^(no|none|nil|nothing|na|n a)(\s+(other\s+|associated\s+)?(symptoms?|issues?|problems?|allergies|medications?|conditions?|surgeries))?$/.test(cleanAlpha)) return false;

    // 1. Punctuation / emoji only
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;

    // 2. URLs
    if (/(https?:\/\/|www\.|\.com\b|\.org\b|\.net\b|\.in\b)/i.test(trimmed)) return true;

    // 3. Repeated characters (e.g. aaaa, ಅಅಅಅ)
    if (/(.)\1{3,}/u.test(trimmed)) return true;

    // 4. Keyboard mash patterns
    if (/(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwerty|zxcv)/i.test(trimmed)) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(trimmed)) return true;
    if (/[a-z]/i.test(trimmed) && !/[aeiouy]/i.test(trimmed) && trimmed.length >= 4) return true;

    return false;
  };

  const refreshAdaptiveState = useCallback(async (currentAnswers: Record<string, any>, mode?: string, questionId?: string) => {
    try {
      setQuestionError(null);
      const state = await getAdaptiveIntakeState(caseId!, mode, questionId);
      setSessionState(state);
      
      if (state.state === 'complete' && !mode) {
        setIsReviewing(true);
      } else {
        setIsReviewing(false);
      }

      if (state.currentQuestion) {
        const rawAns = currentAnswers[state.currentQuestion.id];
        if (rawAns !== undefined) {
          setCurrentAnswer(typeof rawAns === 'string' ? rawAns : rawAns.value || '');
        } else {
          setCurrentAnswer('');
        }
      } else {
        setCurrentAnswer('');
      }
    } catch {
      setQuestionError({
        message: t('intakeFailedLoadQuestion'),
        retry: () => {
          refreshAdaptiveState(currentAnswers, mode, questionId);
        },
      });
    }
  }, [caseId]);

  // ── Load case on mount ────────────────────────────────────────────────
  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(null);
    setQuestionError(null);
    try {
      const [data, unified] = await Promise.all([
        getCase(caseId),
        getUnifiedCase(caseId).catch(() => null)
      ]);
      setClinicalCase(data);
      setUnifiedCase(unified);
      
      const loadedAnswers = data.intakeAnswers || {};
      setAnswers(loadedAnswers);
      
      // If patient is returning and hasn't answered anything yet, show the longitudinal prompt
      if (unified && unified.previousVerified && Object.keys(loadedAnswers).length === 0 && data.status === 'intake') {
        setShowLongitudinalPrompt(true);
      }
      
      if (data.status !== 'intake') {
        setSessionState({
          state: 'complete',
          answeredQuestionIds: Object.keys(loadedAnswers).filter(k => loadedAnswers[k] !== ''),
          skippedQuestionIds: Object.keys(loadedAnswers).filter(k => loadedAnswers[k] === ''),
          irrelevantQuestionIds: [],
          malformedAnswerQuestionIds: []
        });
        setIsReviewing(true);
      } else {
        await refreshAdaptiveState(data.intakeAnswers || {});
      }
    } catch (err: any) {
      setError(t(mapApiErrorToKey(err)));
    } finally {
      setIsLoading(false);
    }
  }, [caseId, refreshAdaptiveState]);

  useEffect(() => {
    if (!caseId) {
      navigate('/patient');
      return;
    }
    loadCase();
  }, [caseId, navigate, loadCase]);

  // ── Stop speaking/listening on unmount ────────────────────────────────
  useEffect(() => {
    return () => {
      stopSpeaking();
      stopListening();
      stopServerSideRecording();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          try { track.stop(); } catch {}
        });
      }
    };
  }, [stopSpeaking, stopListening, stopServerSideRecording]);

  // ── Auto-read question if voice mode is ON ────────────────────────────
  useEffect(() => {
    if (voiceMode && sessionState?.currentQuestion) {
      speakQuestion();
    }
  }, [sessionState?.currentQuestion?.id, voiceMode, speakQuestion]);

  // ── Focus input on question change ────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !error && sessionState?.state !== 'complete' && !isReviewing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionState, isLoading, error, isReviewing]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleAnswerSubmit = async (answerValue: string) => {
    if (!sessionState?.currentQuestion || !caseId || isSubmitting) return;
    
    stopSpeaking();
    stopListening();
    stopServerSideRecording();
    setShowAiTranscriptionNotice(false);
    setAudioError(null);
    setSpeechTranscript('');
    setPendingCriticalConfirmation(null);

    setIsSubmitting(true);
    setError(null);
    setQuestionError(null);
    try {
      const newAnswers = { ...answers, [sessionState.currentQuestion.id]: answerValue };
      const updatedCase = await updateCase(caseId, { intakeAnswers: newAnswers });
      const savedAnswers = updatedCase.intakeAnswers || newAnswers;
      setAnswers(savedAnswers);
      
      // Use next-question / adaptiveState payload returned directly by PUT /cases/{id}
      if (updatedCase.adaptiveState) {
        setSessionState(updatedCase.adaptiveState);
        if (updatedCase.adaptiveState.state === 'complete') {
          setIsReviewing(true);
        } else {
          setIsReviewing(false);
        }
        if (updatedCase.adaptiveState.currentQuestion) {
          const rawAns = savedAnswers[updatedCase.adaptiveState.currentQuestion.id];
          if (rawAns !== undefined) {
            setCurrentAnswer(typeof rawAns === 'string' ? rawAns : rawAns.value || '');
          } else {
            setCurrentAnswer('');
          }
        } else {
          setCurrentAnswer('');
        }
      } else {
        await refreshAdaptiveState(savedAnswers);
      }
    } catch (err: any) {
      setCurrentAnswer(answerValue);
      setQuestionError({
        message: err?.message || t('intakeSaveError'),
        retry: () => {
          handleAnswerSubmit(answerValue);
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (sessionState?.currentQuestion?.options?.length === 0 || !sessionState?.currentQuestion?.options) {
      // Freetext path — run client-side meaningful-answer check
      if (isMeaninglessTextAnswer(currentAnswer)) {
        setValidationError(t('intakeValidationDescribe'));
        return;
      }
    }
    setValidationError(null);

    // Stronger confirmation step for allergies and medicines
    if (sessionState?.currentQuestion && isCriticalQuestion(sessionState.currentQuestion.id)) {
      setPendingCriticalConfirmation({
        answer: currentAnswer,
        questionId: sessionState.currentQuestion.id,
        category: sessionState.currentQuestion.category,
      });
      return;
    }

    handleAnswerSubmit(currentAnswer);
  };
  const handleSkip = () => {
    setPendingCriticalConfirmation(null);
    handleAnswerSubmit('');
  };

  const handlePrevious = async () => {
    if (!caseId || !sessionState?.previousQuestionId) return;
    stopSpeaking();
    stopListening();
    stopServerSideRecording();
    setShowAiTranscriptionNotice(false);
    setAudioError(null);
    setSpeechTranscript('');
    setPendingCriticalConfirmation(null);
    setIsSubmitting(true);
    setError(null);
    setQuestionError(null);
    try {
      await refreshAdaptiveState(answers, 'correction', sessionState.previousQuestionId);
    } catch {
      setQuestionError({
        message: t('intakeNavPrevError'),
        retry: () => {
          handlePrevious();
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUncertain = () => {
    setPendingCriticalConfirmation(null);
    handleAnswerSubmit("I'm not sure / Unknown");
  };

  const handleSelectOption = (optValue: string, displayLabel?: string) => {
    setValidationError(null);
    setCurrentAnswer(displayLabel || optValue);

    // Stronger confirmation step for allergies and medicines
    if (sessionState?.currentQuestion && isCriticalQuestion(sessionState.currentQuestion.id)) {
      setPendingCriticalConfirmation({
        answer: optValue,
        questionId: sessionState.currentQuestion.id,
        category: sessionState.currentQuestion.category,
      });
      return;
    }

    handleAnswerSubmit(optValue);
  };

  const handleEdit = async (questionId: string) => {
    if (!caseId) return;
    setIsSubmitting(true);
    setQuestionError(null);
    try {
      await refreshAdaptiveState(answers, 'correction', questionId);
    } catch {
      setQuestionError({
        message: t('intakeLoadCorrectionError'),
        retry: () => {
          handleEdit(questionId);
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!caseId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await updateCase(caseId, { status: 'patient_verifying' });
      navigate('/patient/documents');
    } catch {
      setError(t('intakeConfirmError'));
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      sessionState?.currentQuestion?.inputType === 'text' &&
      currentAnswer.trim().length > 0
    ) {
      e.preventDefault();
      handleContinue();
    }
  };

  if (!caseId) return null;

  if (isLoading || isSubmitting) {
    return (
      <div className="container">
        <div className="intake-page">
          <LoadingIndicator message={isSubmitting ? t('intakeSavingAnswers') : t('intakeLoading')} />
        </div>
      </div>
    );
  }

  if (error || !clinicalCase) {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-error-card" role="alert">
            <h2>{t('somethingWentWrong')}</h2>
            <ErrorMessage message={error || t('caseNotFound')} />
            <div className="intake-error-actions">
              <Button variant="primary" onClick={loadCase}>{t('tryAgain')}</Button>
              <Link to="/" className="intake-btn intake-btn-skip">{t('backToHome')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionState && questionError) {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-error-card" role="alert">
            <h2>{t('somethingWentWrong')}</h2>
            <ErrorMessage message={questionError.message} />
            <div className="intake-error-actions">
              <Button
                variant="primary"
                onClick={() => {
                  const retryFn = questionError.retry;
                  setQuestionError(null);
                  retryFn();
                }}
              >
                {t('tryAgain')}
              </Button>
              <Link to="/" className="intake-btn intake-btn-skip">{t('backToHome')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionState) {
    return null;
  }

  if (showLongitudinalPrompt && unifiedCase?.previousVerified) {
    const prevDate = unifiedCase.previousVerified.createdAt
      ? formatDate(unifiedCase.previousVerified.createdAt, normLang)
      : '';
    
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>{t('intakeWelcomeBack')}</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>{t('caseLabel')} {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
          </div>
          
          <div className="intake-review-card">
            <div style={{ backgroundColor: 'var(--color-background-alt)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--color-border-subtle)'}}>
              <p style={{ margin: 0, fontWeight: 600 }}>{t('intakePreviousVisitIntro')} {prevDate}.</p>
            </div>
            
            <h2 className="intake-question-prompt">{t('intakeWhatChangedPrompt')}</h2>
            <p className="intake-question-helper">{t('intakeWhatChangedHelp')}</p>
            
            <textarea
              className={`intake-textarea${validationError ? ' intake-input--error' : ''}`}
              placeholder={t('intakeWhatChangedPlaceholder')}
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              rows={4}
              style={{ width: '100%', marginTop: '1rem' }}
            />
            {validationError && (
              <p className="intake-validation-error" role="alert" aria-live="polite">
                {validationError}
              </p>
            )}
            
            <div className="intake-actions" style={{marginTop: '2rem'}}>
              {error && <ErrorMessage message={error} />}
              <Button variant="outline" onClick={() => { setShowLongitudinalPrompt(false); setCurrentAnswer(''); setValidationError(null); }} className="intake-btn intake-btn-skip">
                {t('intakeSkipStartFresh')}
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (isMeaninglessTextAnswer(currentAnswer)) {
                    setValidationError(t('intakeValidationDescribe'));
                    return;
                  }
                  if (currentAnswer.trim().length > 0) {
                    await handleAnswerSubmit(currentAnswer);
                  }
                  setShowLongitudinalPrompt(false);
                  setCurrentAnswer('');
                  setValidationError(null);
                }}
                className="intake-btn-continue"
                disabled={isSubmitting || currentAnswer.trim().length === 0 || isMeaninglessTextAnswer(currentAnswer)}
              >
                {isSubmitting ? t('intakeSaving') : t('intakeSaveContinue')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isReviewing || sessionState.state === 'complete') {
    // Exclude questions that became inactive due to branch changes (e.g. allergy reaction when allergy is No)
    const irrelevantSet = new Set(sessionState.irrelevantQuestionIds || []);
    const relevantEntries = Object.entries(answers).filter(([qId]) => !irrelevantSet.has(qId));

    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>{t('intakeReviewHistoryHeading')}</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>{t('caseLabel')} {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} /></p>
          </div>

          <div className="intake-review-card">
            <p className="intake-review-intro">
              {t('intakeReviewHistorySubtitle')}
            </p>
            
            <div className="intake-review-list">
              {relevantEntries.map(([qId, ans]) => {
                const answerText = typeof ans === 'string' ? ans : (ans?.value || ans?.originalValue || '');
                const isSkipped = !answerText || answerText.trim().length === 0;
                const isUncertain = answerText.toLowerCase().includes('not sure') || answerText.toLowerCase().includes('unknown');

                return (
                  <div key={qId} className="intake-review-item">
                    <div className="intake-review-item-content">
                      <strong>{qId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong>
                      <p>
                        {isSkipped ? (
                          <em style={{opacity: 0.6}}>{t('intakeBadgeSkipped')}</em>
                        ) : (
                          <span>
                            {answerText}
                            {isUncertain && (
                              <span className="verification-badge" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid var(--color-warning)' }}>
                                {t('intakeBadgeUncertain')}
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => handleEdit(qId)} className="intake-btn-edit">{t('edit')}</Button>
                  </div>
                );
              })}
            </div>

            <div className="intake-actions" style={{marginTop: '2rem'}}>
              {error && <ErrorMessage message={error} />}
              {questionError && (
                <div className="intake-error-banner" role="alert" style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', borderRadius: '6px' }}>
                  <ErrorMessage message={questionError.message} />
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        const retryFn = questionError.retry;
                        setQuestionError(null);
                        retryFn();
                      }}
                    >
                      {t('tryAgain')}
                    </Button>
                  </div>
                </div>
              )}
              <Button
                variant="primary"
                onClick={handleComplete}
                className="intake-btn-complete"
                id="intake-continue-documents"
                disabled={isSubmitting}
                style={{width: '100%', textAlign: 'center', display: 'block'}}
              >
                {isSubmitting ? t('loading') : t('intakeConfirmContinueDocuments')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionState.state === 'safety_escalation' && sessionState.safetyEscalation) {
    const escalation = sessionState.safetyEscalation;
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>{t('safetyNoticeHeading')}</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center"}}>
              {t('caseLabel')} {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
          </div>

          <div className="intake-safety-card" role="alert">
            <div className="intake-safety-header">
              <span className="intake-safety-icon" aria-hidden="true">🚨</span>
              <h2>{(escalation as any).headlineLocalized || escalation.headline || t('safetyImmediateAttention')}</h2>
            </div>

            <p className="intake-safety-message">{(escalation as any).reasonLocalized || escalation.reason}</p>

            <div className="intake-safety-instructions">
              <strong>{t('safetyRecommendedAction')}</strong>
              <p>{(escalation as any).guidanceLocalized || escalation.guidance}</p>
            </div>

            {escalation.redFlagsDetected && escalation.redFlagsDetected.length > 0 && (
              <div className="intake-safety-flags">
                <strong>{t('safetySymptomsConcern')}</strong>
                <ul>
                  {escalation.redFlagsDetected.map((flag, idx) => (
                    <li key={idx}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="intake-safety-disclaimer">
              {t('safetyDeterministicNotice')}
            </p>

            <div className="intake-safety-actions">
              <a href="tel:112" className="intake-btn intake-btn-emergency" id="btn-call-emergency">
                {t('safetyCallEmergency')}
              </a>
              {sessionState.previousQuestionId && (
                <button
                  type="button"
                  onClick={() => handleEdit(sessionState.previousQuestionId!)}
                  className="intake-btn intake-btn-edit"
                  disabled={isSubmitting}
                >
                  {t('safetyEditLastAnswer')}
                </button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsReviewing(true)}
                className="intake-btn intake-btn-skip"
              >
                {t('safetyReviewSoFar')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionState.state === 'incomplete') {
    return (
      <div className="container">
        <div className="intake-page">
          <div className="intake-header">
            <h1>{t('intakeThresholdReachedTitle')}</h1>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center"}}>
              {t('caseLabel')} {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
          </div>

          <div className="intake-question-card" style={{ borderColor: 'var(--color-accent)' }}>
            <h2 className="intake-question-category">{t('intakeClinicalSafeguardLimit')}</h2>
            <p className="intake-question-prompt">
              {t('intakeSafeguardIntro')}
            </p>
            <p className="intake-question-helper">
              {t('intakeSafeguardDetails')}
            </p>

            <div className="intake-actions" style={{ marginTop: '2rem' }}>
              <Button
                variant="primary"
                onClick={() => setIsReviewing(true)}
                className="intake-btn-complete"
                style={{ width: '100%', textAlign: 'center' }}
              >
                {t('intakeProceedToVerify')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { currentQuestion, state, issue, answeredQuestionIds, previousQuestionId, clinicalProgress } = sessionState;
  if (!currentQuestion) return null;
  const answeredCount = answeredQuestionIds?.length || 0;
  const total = sessionState.totalEligibleQuestions || (answeredCount + 1);
  const currentIdx = sessionState.currentQuestionIndex || (answeredCount + 1);
  const hasTotal = typeof clinicalProgress?.totalRelevantGaps === 'number' && clinicalProgress.totalRelevantGaps > 0;
  const currentPoint = (clinicalProgress?.resolvedGaps ?? answeredCount) + 1;
  const progressPercent = hasTotal
    ? Math.min(100, Math.max(10, Math.round(((clinicalProgress?.resolvedGaps || 0) / clinicalProgress!.totalRelevantGaps!) * 100)))
    : Math.min(100, Math.max(10, Math.round((currentIdx / Math.max(total, 1)) * 100)));
  const pointText = hasTotal
    ? t('intakeProgressPoint', { current: currentPoint, total: clinicalProgress!.totalRelevantGaps! })
    : t('intakeProgressPointCurrentOnly', { current: currentPoint });
  const progressLabel = `(${pointText})`;

  return (
    <div className="container">
      <div className="intake-page">
        <div className="intake-nav-controls">
          <Link to="/" className="intake-back-link" style={{ margin: 0 }}>← {t('backToHome')}</Link>
          {previousQuestionId && (
            <button
              type="button"
              onClick={handlePrevious}
              className="intake-btn-nav-back"
              disabled={isSubmitting}
              aria-label={t('intakePrevQuestionAria')}
            >
              {t('intakePrevQuestion')}
            </button>
          )}
        </div>

        <div className="intake-header">
          <h1>{t('intakeHeading')}</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <p className="intake-case-id" style={{display: "flex", alignItems: "center", gap: "0.5rem", margin: 0}}>
              {t('caseLabel')} {clinicalCase.caseId} <StatusBadge status={clinicalCase.status} />
            </p>
            <div className="intake-lang-switch">
              <label htmlFor="intake-lang-select" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {t('languageLabel')}:
              </label>
              <select
                id="intake-lang-select"
                value={normLang === 'kn' ? 'Kannada' : normLang === 'hi' ? 'Hindi' : 'English'}
                onChange={async (e) => {
                  const newLang = e.target.value;
                  setSessionLanguage(newLang);
                  if (clinicalCase && caseId) {
                    setClinicalCase({ ...clinicalCase, language: newLang });
                    await updateCase(caseId, { language: newLang });
                    await refreshAdaptiveState(answers);
                  }
                }}
                className="intake-lang-select"
              >
                <option value="English">{t('languageEnglish')}</option>
                <option value="Hindi">{t('languageHindi')}</option>
                <option value="Kannada">{t('languageKannada')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Voice Mode Toggle Bar (Web Speech API) */}
        <div className="intake-voice-bar">
          <div className="intake-voice-toggle-group">
            <div>
              <span className="intake-voice-label">{t('intakeVoiceMode')}</span>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                {t('intakeVoiceSubtext', { lang: speechLangName })}
              </p>
            </div>
            <button
              type="button"
              className={`intake-voice-toggle-btn ${voiceMode ? 'intake-voice-toggle-btn--active' : ''}`}
              onClick={() => {
                const nextMode = !voiceMode;
                setVoiceMode(nextMode);
                if (!nextMode) stopSpeaking();
              }}
              aria-pressed={voiceMode}
              id="btn-toggle-voice-mode"
            >
              {voiceMode ? <span>🔊 {t('intakeVoiceModeOn')}</span> : <span>🔈 {t('intakeVoiceModeOff')}</span>}
            </button>
          </div>
          {speechError && (
            <div className="intake-speech-fallback-banner" role="alert">
              <span>ℹ️</span> {speechError}
            </div>
          )}
        </div>

        <div className="intake-progress">
          <div className="intake-progress-header">
            <span className="intake-progress-label">{currentQuestion.categoryLocalized || currentQuestion.category}</span>
            <span className="intake-progress-count">{progressLabel}</span>
          </div>
          <div className="intake-progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className="intake-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {clinicalProgress && (
            <div className="intake-progress-chips" aria-label={t('intakeDomainsExplored')}>
              {(clinicalProgress.domainsExploredLocalized || clinicalProgress.exploredDomains || clinicalProgress.domainsExplored)?.map((domain) => (
                <span key={domain} className="intake-chip intake-chip--done">
                  ✓ {domain}
                </span>
              ))}
              {(clinicalProgress.activeDomainLocalized || clinicalProgress.activeDomain) && (
                <span className="intake-chip intake-chip--active">
                  ● {clinicalProgress.activeDomainLocalized || clinicalProgress.activeDomain}
                </span>
              )}
            </div>
          )}
        </div>

        <div className={`intake-question-card ${state === 'clarification' ? 'intake-clarification-card' : ''}`} key={currentQuestion.id}>
          {sessionState.translationFallbackNotice && !currentQuestion.promptLocalized && (
            <div className="intake-fallback-notice" role="alert">
              <span>⚠️</span> {sessionState.translationFallbackNotice}
            </div>
          )}

          {state === 'clarification' && (
            <div className="intake-clarification-banner">
              <span aria-hidden="true">⚠️</span> {sessionState.issueLocalized || issue || t('intakeClarificationPrompt') || 'Could you provide a little more detail for clarity?'}
            </div>
          )}

          {state === 'clarification' && sessionState.originalAnswer && (
            <div className="intake-original-box">
              <div className="intake-original-box-label">{t('intakePreviousResponse')}</div>
              <div className="intake-original-box-val">"{sessionState.originalAnswer}"</div>
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <h2 className="intake-question-category" style={{ margin: 0 }}>
              {currentQuestion.categoryLocalized || currentQuestion.category}
            </h2>
            {sessionState.aiTranslationTag && (
              <span className="intake-ai-tag">
                🤖 {sessionState.aiTranslationTag}
              </span>
            )}
          </div>

          <div className="intake-prompt-row">
            <p className="intake-question-prompt">{currentQuestion.promptLocalized || currentQuestion.prompt}</p>
            {(isIndicLang || hasSpeechSynthesis) && (
              <button
                type="button"
                className={`intake-btn-read-aloud ${isSpeaking ? 'intake-btn-read-aloud--speaking' : ''}`}
                onClick={() => (isSpeaking ? stopSpeaking() : speakQuestion())}
                title={isIndicLang ? (isSpeaking ? t('stopAudio') : t('readAloud')) : (hasVoiceForLang ? "Read question aloud or replay" : t('noVoiceForLang'))}
                disabled={(!isIndicLang && !hasVoiceForLang) || isAudioLoading}
                aria-label={isSpeaking ? t('stopAudio') : t('readAloud')}
                id="btn-read-aloud-question"
              >
                {isAudioLoading ? <span>⏳ {t('audioLoading')}</span> : isSpeaking ? <span>⏹ {t('stopAudio')}</span> : <span>🔊 {t('readAloud')}</span>}
              </button>
            )}
          </div>

          {isAudioLoading && (
            <div className="intake-audio-status intake-audio-status--loading" role="status" style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.35rem' }}>
              ⏳ {t('audioLoading')}
            </div>
          )}
          {isSpeaking && (
            <div className="intake-audio-status intake-audio-status--playing" role="status" style={{ fontSize: '0.8rem', color: 'var(--color-success, #16a34a)', marginTop: '0.35rem' }}>
              🔊 {isIndicLang ? (normLang === 'kn' ? 'ಧ್ವನಿ ಪ್ಲೇ ಆಗುತ್ತಿದೆ (AI voice)' : 'ऑडियो चल रहा है (AI voice)') : t('intakePlayingBrowserVoice')}
            </div>
          )}
          {audioError && (
            <div className="intake-no-voice-notice" role="alert" style={{ marginTop: '0.5rem' }}>
              ⚠️ {audioError}
            </div>
          )}
          {!isIndicLang && !hasVoiceForLang && (
            <div className="intake-no-voice-notice" role="note">
              ℹ️ {t('noVoiceForLang')}
            </div>
          )}
          
          {(currentQuestion.helperTextLocalized || currentQuestion.helperText) && (
            <p className="intake-question-helper" id={`helper-${currentQuestion.id}`}>
              {currentQuestion.helperTextLocalized || currentQuestion.helperText}
            </p>
          )}

          {/* Quick Option Pills */}
          {((currentQuestion.options && currentQuestion.options.length > 0) || currentQuestion.allowsNone) && (
            <div className="intake-options-group">
              <div className="intake-options-title">{t('intakeSuggestedOptions')}</div>
              <div className="intake-pills-container">
                {currentQuestion.options?.map((opt: any, idx: number) => {
                  const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || opt.id || String(opt));
                  const rawDisplay = currentQuestion.optionsLocalized?.[idx] || opt;
                  const displayLabel = typeof rawDisplay === 'string' ? rawDisplay : (rawDisplay.label || rawDisplay.value || String(rawDisplay));
                  const isSelected = currentAnswer.trim().toLowerCase() === optValue.toLowerCase() || currentAnswer.trim().toLowerCase() === displayLabel.toLowerCase();
                  return (
                    <button
                      key={typeof opt === 'string' ? opt : (opt.id || opt.value || idx)}
                      type="button"
                      className={`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`}
                      onClick={() => handleSelectOption(optValue, displayLabel)}
                      disabled={isSubmitting}
                    >
                      {displayLabel}
                    </button>
                  );
                })}
                {currentQuestion.allowsNone && !currentQuestion.options?.some((opt: any) => {
                  const s = (typeof opt === 'string' ? opt : (opt.value || opt.label || '')).toLowerCase();
                  return s.includes('no ') || s.includes('none') || s.includes('ಯಾವುದೇ') || s.includes('ಇಲ್ಲ') || s.includes('कोई') || s.includes('नहीं');
                }) && (
                  <button
                    type="button"
                    className={`intake-option-pill ${currentAnswer.trim().toLowerCase() === 'no other symptoms' || currentAnswer.trim().toLowerCase() === (normLang === 'kn' ? 'ಯಾವುದೇ ಇತರ ಲಕ್ಷಣಗಳಿಲ್ಲ' : normLang === 'hi' ? 'कोई अन्य लक्षण नहीं' : 'no other symptoms') ? 'intake-option-pill--selected' : ''}`}
                    onClick={() => {
                      const noneText = normLang === 'kn' ? 'ಯಾವುದೇ ಇತರ ಲಕ್ಷಣಗಳಿಲ್ಲ' : normLang === 'hi' ? 'कोई अन्य लक्षण नहीं' : 'No other symptoms';
                      handleSelectOption('No other symptoms', noneText);
                    }}
                    disabled={isSubmitting}
                  >
                    {normLang === 'kn' ? 'ಯಾವುದೇ ಇತರ ಲಕ್ಷಣಗಳಿಲ್ಲ' : normLang === 'hi' ? 'कोई अन्य लक्षण नहीं' : 'No other symptoms'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Clarification Specific Option Pills */}
          {state === 'clarification' && currentQuestion.clarificationOptions && currentQuestion.clarificationOptions.length > 0 && (
            <div className="intake-options-group">
              <div className="intake-options-title">{t('intakeSuggestedClarifications')}</div>
              <div className="intake-pills-container">
                {currentQuestion.clarificationOptions.map((opt: any, idx: number) => {
                  const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || opt.id || String(opt));
                  const rawDisplay = currentQuestion.clarificationOptionsLocalized?.[idx] || opt;
                  const displayLabel = typeof rawDisplay === 'string' ? rawDisplay : (rawDisplay.label || rawDisplay.value || String(rawDisplay));
                  const isSelected = currentAnswer.trim().toLowerCase() === optValue.toLowerCase() || currentAnswer.trim().toLowerCase() === displayLabel.toLowerCase();
                  return (
                    <button
                      key={typeof opt === 'string' ? opt : (opt.id || opt.value || idx)}
                      type="button"
                      className={`intake-option-pill ${isSelected ? 'intake-option-pill--selected' : ''}`}
                      onClick={() => handleSelectOption(optValue, displayLabel)}
                      disabled={isSubmitting}
                    >
                      {displayLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Voice Input: Server-Side for Kannada/Hindi, Web Speech API for English */}
          {isIndicLang ? (
            <div className="intake-mic-container">
              <button
                type="button"
                className={`intake-mic-btn ${micRecordState === 'recording' ? 'intake-mic-btn--listening' : ''}`}
                onClick={
                  micRecordState === 'recording'
                    ? stopServerSideRecording
                    : micRecordState === 'transcribing'
                    ? undefined
                    : startServerSideRecording
                }
                disabled={isSubmitting || micRecordState === 'transcribing'}
                aria-label={
                  micRecordState === 'recording'
                    ? t('stopAudio')
                    : micRecordState === 'transcribing'
                    ? t('micTranscribing')
                    : t('micTapToSpeakLang', { lang: speechLangName })
                }
                id="btn-mic-input"
              >
                <span aria-hidden="true">
                  {micRecordState === 'recording' ? '⏹️' : micRecordState === 'transcribing' ? '⏳' : '🎙️'}
                </span>
                <span>
                  {micRecordState === 'recording'
                    ? t('micRecording', { seconds: 30 - recordingSeconds })
                    : micRecordState === 'transcribing'
                    ? t('micTranscribing')
                    : t('micTapToSpeakLang', { lang: speechLangName })}
                </span>
              </button>
              {micRecordState === 'recording' && (
                <p className="intake-listening-hint" aria-live="polite">
                  {speechLangName} {t('micRecording')} — {t('micSecondsRemaining', { seconds: 30 - recordingSeconds })}
                </p>
              )}
              {speechError && (
                <p className="intake-speech-unsupported-note" role="alert" style={{ color: '#b91c1c' }}>
                  ⚠️ {speechError}
                </p>
              )}
            </div>
          ) : hasSpeechRecognition ? (
            <div className="intake-mic-container">
              <button
                type="button"
                className={`intake-mic-btn ${isListening ? 'intake-mic-btn--listening' : ''}`}
                onClick={isListening ? stopListening : startListening}
                disabled={isSubmitting}
                aria-label={isListening ? t('stopAudio') : t('micTapToSpeakLang', { lang: speechLangName })}
                id="btn-mic-input"
              >
                <span aria-hidden="true">{isListening ? '⏹️' : '🎙️'}</span>
                <span>{isListening ? t('micListening') : t('micTapToSpeakLang', { lang: speechLangName })}</span>
              </button>
              {isListening && (
                <p className="intake-listening-hint" aria-live="polite">
                  {t('intakeVoiceListeningHint', { lang: speechLangName })}
                </p>
              )}
              {speechError && (
                <p className="intake-speech-unsupported-note" role="alert" style={{ color: '#b91c1c' }}>
                  ⚠️ {speechError}
                </p>
              )}
            </div>
          ) : (
            <p className="intake-speech-unsupported-note">
              🎙️ {t('intakeSpeechUnsupported')}
            </p>
          )}

          {/* AI Transcription Notice */}
          {showAiTranscriptionNotice && (
            <div
              className="intake-ai-transcription-notice"
              role="status"
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                fontSize: '0.875rem',
                color: '#1e40af'
              }}
            >
              ℹ️ {t('micTranscriptionNotice')}
            </div>
          )}

          {/* Editable Speech Transcript Banner */}
          {speechTranscript && (
            <div className="intake-transcript-banner" aria-live="polite">
              <div className="intake-transcript-header">
                <span className="intake-transcript-tag">{t('intakeVoiceAnswerTag')}</span>
                <span className="intake-transcript-hint">{t('intakeVoiceAnswerHint')}</span>
              </div>
              <div className="intake-transcript-content">"{speechTranscript}"</div>
            </div>
          )}

          {/* Safety Confirmation Step for Allergies & Medications */}
          {pendingCriticalConfirmation && (
            <div className="intake-critical-confirmation-card" role="dialog" aria-modal="true">
              <div className="intake-critical-header">
                <span aria-hidden="true">⚠️</span>
                <h3>{t('intakeConfirmCategory', { category: pendingCriticalConfirmation.category })}</h3>
              </div>
              <p className="intake-critical-desc">
                {t('intakeCriticalSafetyDesc')}
              </p>
              <div className="intake-critical-value-box">
                <strong>{t('intakeUnderstoodAnswer')}</strong> "{pendingCriticalConfirmation.answer}"
              </div>
              <div className="intake-critical-actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    const ans = pendingCriticalConfirmation.answer;
                    handleAnswerSubmit(ans);
                  }}
                  className="intake-btn-confirm-critical"
                  id="intake-btn-confirm-critical"
                >
                  {t('intakeConfirmCorrect')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingCriticalConfirmation(null);
                    if (inputRef.current) inputRef.current.focus();
                  }}
                  className="intake-btn-edit-critical"
                  id="intake-btn-edit-critical"
                >
                  {t('intakeCorrectEdit')}
                </Button>
              </div>
            </div>
          )}

          {currentQuestion.inputType === 'textarea' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              id={`intake-${currentQuestion.id}`}
              className={`intake-textarea${validationError ? ' intake-input--error' : ''}`}
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.promptLocalized || currentQuestion.prompt}
              aria-invalid={!!validationError}
              placeholder={t('intakeTypePlaceholder')}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              id={`intake-${currentQuestion.id}`}
              className={`intake-input${validationError ? ' intake-input--error' : ''}`}
              value={currentAnswer}
              onChange={(e) => { setCurrentAnswer(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              aria-describedby={currentQuestion.helperText ? `helper-${currentQuestion.id}` : undefined}
              aria-label={currentQuestion.promptLocalized || currentQuestion.prompt}
              aria-invalid={!!validationError}
              placeholder={t('intakeTypePlaceholder')}
            />
          )}
          {questionError && (
            <div className="intake-error-banner" role="alert" style={{ margin: '1rem 0', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', borderRadius: '6px' }}>
              <ErrorMessage message={questionError.message} />
              <div style={{ marginTop: '0.5rem' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    const retryFn = questionError.retry;
                    setQuestionError(null);
                    retryFn();
                  }}
                >
                  {t('tryAgain')}
                </Button>
              </div>
            </div>
          )}

          <div className="intake-actions">
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="outline"
                onClick={handleSkip}
                className="intake-btn intake-btn-skip"
                disabled={isSubmitting}
              >
                {t('intakeSkipThis')}
              </Button>
              {sessionState.allowUncertainty !== false && (
                <button
                  type="button"
                  onClick={handleUncertain}
                  className="intake-btn-uncertain"
                  disabled={isSubmitting}
                  title={t('intakeUncertaintyTooltip')}
                >
                  {t('intakeNotSure')}
                </button>
              )}
            </div>
            {validationError && (
              <p className="intake-validation-error" role="alert" aria-live="polite">
                {validationError}
              </p>
            )}
            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={currentAnswer.trim().length === 0 || isSubmitting || isMeaninglessTextAnswer(currentAnswer)}
              id="intake-btn-continue"
              className="intake-btn intake-btn-continue"
            >
              {state === 'clarification' ? t('intakeSaveClarification') : t('intakeContinue')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
