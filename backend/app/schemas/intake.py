from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class IntakeState(str, Enum):
    QUESTION = "question"
    CLARIFICATION = "clarification"
    CORRECTION = "correction"
    COMPLETE = "complete"


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
    inputType: str
    dependency: Optional[IntakeDependency] = None


class IntakeSessionState(BaseModel):
    state: IntakeState
    currentQuestion: Optional[IntakeQuestion] = None
    answeredQuestionIds: List[str]
    skippedQuestionIds: List[str]
    irrelevantQuestionIds: List[str]
    malformedAnswerQuestionIds: List[str]
    issue: Optional[str] = None
