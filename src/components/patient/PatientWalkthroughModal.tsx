import { useState, useEffect, useRef } from 'react';
import { useT } from '../../i18n/useT';
import { synthesizeSpeech } from '../../utils/api';
import './PatientWalkthroughModal.css';

interface PatientWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: string;
}

export function PatientWalkthroughModal({ isOpen, onClose, lang = 'en' }: PatientWalkthroughModalProps) {
  const { t } = useT(lang);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const steps = [
    {
      title: t('walkthroughStep1Title'),
      body: t('walkthroughStep1Body'),
      icon: '💬',
    },
    {
      title: t('walkthroughStep2Title'),
      body: t('walkthroughStep2Body'),
      icon: '🔊',
    },
    {
      title: t('walkthroughStep3Title'),
      body: t('walkthroughStep3Body'),
      icon: '✏️',
    },
    {
      title: t('walkthroughStep4Title'),
      body: t('walkthroughStep4Body'),
      icon: '🛡️',
    },
  ];

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsPlayingAudio(false);
  };

  const handleClose = () => {
    stopAudio();
    try {
      sessionStorage.setItem('medmap_walkthrough_seen', 'true');
    } catch {}
    onClose();
  };

  // Focus trapping and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Initial focus on the modal container or next button
    const timer = setTimeout(() => {
      const nextBtn = modalRef.current?.querySelector<HTMLElement>('.walkthrough-btn-primary');
      if (nextBtn) {
        nextBtn.focus();
      } else {
        modalRef.current?.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      stopAudio();
      if (previousActiveElementRef.current) {
        try {
          previousActiveElementRef.current.focus();
        } catch {}
      }
    };
  }, [isOpen]);

  // Audio speech synthesis
  const handleListen = async () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    const step = steps[currentStep];
    const textToSpeak = `${step.title}. ${step.body}`;
    const normLang = (lang || 'en').toLowerCase().slice(0, 2);

    setIsPlayingAudio(true);

    if (normLang === 'hi' || normLang === 'kn') {
      try {
        const blob = await synthesizeSpeech(textToSpeak, normLang);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsPlayingAudio(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch {
        // Degrade silently if audio unavailable
        setIsPlayingAudio(false);
      }
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = 'en-US';
          utterance.onend = () => setIsPlayingAudio(false);
          utterance.onerror = () => setIsPlayingAudio(false);
          window.speechSynthesis.speak(utterance);
        } catch {
          setIsPlayingAudio(false);
        }
      } else {
        setIsPlayingAudio(false);
      }
    }
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    stopAudio();
    if (isLastStep) {
      handleClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    stopAudio();
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div
      className="walkthrough-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="walkthrough-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        aria-describedby="walkthrough-body"
        tabIndex={-1}
      >
        <div className="walkthrough-header">
          <span className="walkthrough-step-badge">
            {t('walkthroughStepIndicator', { current: currentStep + 1, total: steps.length })}
          </span>
          <button
            type="button"
            className="walkthrough-btn-skip"
            onClick={handleClose}
            aria-label={t('walkthroughSkip')}
          >
            {t('walkthroughSkip')}
          </button>
        </div>

        <div className="walkthrough-content">
          <div className="walkthrough-icon" aria-hidden="true">
            {step.icon}
          </div>
          <h2 id="walkthrough-title" className="walkthrough-title">
            {step.title}
          </h2>
          <p id="walkthrough-body" className="walkthrough-body">
            {step.body}
          </p>

          <button
            type="button"
            className={`walkthrough-btn-listen ${isPlayingAudio ? 'playing' : ''}`}
            onClick={handleListen}
            aria-label={isPlayingAudio ? t('walkthroughListening') : t('walkthroughListen')}
          >
            {isPlayingAudio ? `🔊 ${t('walkthroughListening')}` : `▶️ ${t('walkthroughListen')}`}
          </button>
        </div>

        <div className="walkthrough-indicators" aria-hidden="true">
          {steps.map((_, idx) => (
            <span
              key={idx}
              className={`walkthrough-dot ${idx === currentStep ? 'active' : ''}`}
            />
          ))}
        </div>

        <div className="walkthrough-footer">
          {!isFirstStep && (
            <button
              type="button"
              className="walkthrough-btn-secondary"
              onClick={handleBack}
              aria-label={t('walkthroughBack')}
            >
              {t('walkthroughBack')}
            </button>
          )}
          <button
            type="button"
            className="walkthrough-btn-primary"
            onClick={handleNext}
            aria-label={isLastStep ? t('walkthroughFinish') : t('walkthroughNext')}
          >
            {isLastStep ? t('walkthroughFinish') : t('walkthroughNext')}
          </button>
        </div>
      </div>
    </div>
  );
}
