from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class IntakeState(str, Enum):
    QUESTION = "question"
    CLARIFICATION = "clarification"
    CORRECTION = "correction"
    SAFETY_ESCALATION = "safety_escalation"
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"


class IntakeRequestMode(str, Enum):
    CLARIFICATION = "clarification"
    CORRECTION = "correction"


class IntakeDependency(BaseModel):
    model_config = ConfigDict(frozen=True)

    questionId: str
    excludedAnswers: tuple[str, ...] = ()


class IntakeQuestion(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    category: str
    prompt: str
    helperText: Optional[str] = None
    inputType: str = "text"
    dependency: Optional[IntakeDependency] = None
    options: Optional[tuple[str, ...]] = None
    clarificationOptions: Optional[tuple[str, ...]] = None
    isOptional: bool = False
    purpose: Optional[str] = None
    gapExplored: Optional[str] = None
    # Localized display fields (populated by translation layer; absent for English)
    promptLocalized: Optional[str] = None
    helperTextLocalized: Optional[str] = None
    optionsLocalized: Optional[tuple[str, ...]] = None
    clarificationOptionsLocalized: Optional[tuple[str, ...]] = None
    categoryLocalized: Optional[str] = None


class SafetyEscalation(BaseModel):
    isEscalated: bool = False
    severity: str = "EMERGENCY"
    title: str = "Immediate Medical Attention Advised"
    message: str
    instructions: str
    redFlags: List[str] = []


class ClinicalProgress(BaseModel):
    domainsExplored: List[str] = []
    activeDomain: Optional[str] = None
    questionsAnswered: int = 0
    coverageStatus: str = "in_progress"
    unresolvedGapsCount: int = 0


class IntakeSessionState(BaseModel):
    state: IntakeState
    currentQuestion: Optional[IntakeQuestion] = None
    answeredQuestionIds: List[str]
    skippedQuestionIds: List[str]
    irrelevantQuestionIds: List[str]
    malformedAnswerQuestionIds: List[str]
    issue: Optional[str] = None
    issueLocalized: Optional[str] = None
    previousQuestionId: Optional[str] = None
    originalAnswer: Optional[str] = None
    clarificationAttempts: int = 0
    totalEligibleQuestions: Optional[int] = None
    currentQuestionIndex: Optional[int] = None
    allowUncertainty: bool = True
    safetyEscalation: Optional[SafetyEscalation] = None
    clinicalProgress: Optional[ClinicalProgress] = None
    questionMeta: Optional[Dict[str, Any]] = None
    completionReason: Optional[str] = None
    # Translation metadata
    translated: bool = False
    translationLang: Optional[str] = None
    translationFallbackNotice: Optional[str] = None
    aiTranslationTag: Optional[str] = None
