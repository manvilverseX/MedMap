# MedMap — Patient Intake Inspection Report

**Developer:** Harsh  
**Branch:** `feature/harsh-ui-intake`  
**Date:** 2026-09-21  
**Mode:** INSPECTION ONLY — no files were modified  

---

## 1. Current Branch

✅ **Confirmed:** `feature/harsh-ui-intake`  
✅ **Working tree:** Clean (no uncommitted changes)

---

## 2. Patient Intake Routes

| Route | Component | Purpose |
|---|---|---|
| `/patient` | [PatientOnboardingPage](file:///c:/MedMap/src/pages/patient/PatientOnboardingPage.tsx) | Collects patient ID + language, creates a case via API, navigates to `/patient/intake` |
| `/patient/intake` | [PatientIntakePage](file:///c:/MedMap/src/pages/patient/PatientIntakePage.tsx) | **The intake page** — currently a placeholder showing case metadata |
| `/patient/documents` | [PatientDocumentsPage](file:///c:/MedMap/src/pages/patient/PatientDocumentsPage.tsx) | Stub — "upload area will go here" |
| `/patient/verification` | [PatientVerificationPage](file:///c:/MedMap/src/pages/patient/PatientVerificationPage.tsx) | Stub — "patient will review the Unified Case" |

Routes defined in [App.tsx](file:///c:/MedMap/src/App.tsx#L14-L23). Router and `CaseProvider` wrapped in [main.tsx](file:///c:/MedMap/src/main.tsx#L8-L16).

---

## 3. Existing Intake Behavior (PatientIntakePage)

### What it does today

The [PatientIntakePage](file:///c:/MedMap/src/pages/patient/PatientIntakePage.tsx) is **not an intake questionnaire**. It is a **case metadata viewer + status updater**:

| Aspect | Current State |
|---|---|
| **Question representation** | ❌ None. No questions are asked. |
| **Answer representation** | ❌ None. No user input field for medical information. |
| **Progress tracking** | ❌ None. No stepper, progress bar, or question counter. |
| **Continue to next question** | ❌ Not applicable — there is no questionnaire flow. |
| **Loading state** | ✅ Exists — `isLoading` state + "Loading case…" text (line 63–64). |
| **Error state** | ✅ Exists — `error` state + red text display (line 61). |
| **Updating state** | ✅ Exists — `isUpdating` state on the "Move to Verification" button (lines 73–79). |
| **Mock/deterministic questioning** | ❌ None. No question data, no mock API, no hardcoded questions. |
| **What happens on refresh** | `CaseContext` initializes from `sessionStorage.getItem('activeCaseId')` → page re-fetches case from API via `getCase(caseId)`. If `caseId` is null, redirects to `/patient`. |
| **Functional parts** | Case fetch + display (caseId, patientId, language, status). Status update button ("Move to Verification") calls `PUT /api/v1/cases/{caseId}` with `status: 'patient_verifying'`. |
| **Placeholder parts** | The entire "Intake Chat" heading (line 59) is a placeholder — no chat/question UI exists. |

### Current page renders:
1. Header with "Patient Case Taking" logo
2. Navigation links: Back to Home, Next: Documents
3. "Intake Chat" heading (misleading — no chat exists)
4. Case detail card showing: caseId, patientId, language, status
5. "Move to Verification" button

---

## 4. All Relevant Files

### Frontend — Patient Intake Core
| File | Purpose | Size |
|---|---|---|
| [PatientIntakePage.tsx](file:///c:/MedMap/src/pages/patient/PatientIntakePage.tsx) | The intake page (placeholder) | 88 lines |
| [PatientOnboardingPage.tsx](file:///c:/MedMap/src/pages/patient/PatientOnboardingPage.tsx) | Onboarding form → creates case → navigates to intake | 80 lines |

### Context & State
| File | Purpose |
|---|---|
| [CaseContext.tsx](file:///c:/MedMap/src/context/CaseContext.tsx) | Provides `caseId` + `setCaseId`, persisted to `sessionStorage` |

### API Layer
| File | Purpose |
|---|---|
| [api.ts](file:///c:/MedMap/src/utils/api.ts) | `createCase`, `getCase`, `updateCaseStatus` against `http://localhost:8000/api/v1` |

### TypeScript Contracts
| File | Key Types |
|---|---|
| [case.ts](file:///c:/MedMap/src/types/case.ts) | `CaseStatus`, `ClinicalCase` (caseId, patientId, status, language, etc.) |
| [patient.ts](file:///c:/MedMap/src/types/patient.ts) | `Patient` (patientId, name, age, gender, preferredLanguage) |
| [unifiedCase.ts](file:///c:/MedMap/src/types/unifiedCase.ts) | `UnifiedCase`, `ClinicalHistory`, `TimelineEvent`, `DoctorReview` |
| [trust.ts](file:///c:/MedMap/src/types/trust.ts) | `Evidence`, `PatientVerificationStatus`, `DoctorReviewStatus` |
| [document.ts](file:///c:/MedMap/src/types/document.ts) | `Document`, `DocumentProcessingStatus` |
| [index.ts](file:///c:/MedMap/src/types/index.ts) | Barrel re-export of all types |

### Shared Components
| File | Purpose |
|---|---|
| [Card.tsx](file:///c:/MedMap/src/components/Card.tsx) | Styled card with hand-drawn border + optional green highlight |
| [Badge.tsx](file:///c:/MedMap/src/components/Badge.tsx) | Marquee scrolling banner (currently used for "under development" on landing) |

### Styling
| File | Purpose |
|---|---|
| [index.css](file:///c:/MedMap/src/index.css) | **Primary design system** — 198 lines of tokens + component styles |
| [App.css](file:///c:/MedMap/src/App.css) | Leftover Vite scaffold styles (not meaningfully used by patient pages) |

### Routing & Entry
| File | Purpose |
|---|---|
| [App.tsx](file:///c:/MedMap/src/App.tsx) | All route definitions |
| [main.tsx](file:///c:/MedMap/src/main.tsx) | BrowserRouter + CaseProvider wrapper |

### Backend (for reference)
| File | Purpose |
|---|---|
| [cases.py (API)](file:///c:/MedMap/backend/app/api/v1/cases.py) | POST `/cases`, GET `/cases/{id}`, PUT `/cases/{id}` |
| [case.py (schema)](file:///c:/MedMap/backend/app/schemas/case.py) | `CaseCreate`, `CaseUpdate`, `CaseResponse` Pydantic models |
| [case.py (model)](file:///c:/MedMap/backend/app/models/case.py) | SQLAlchemy model for `cases` table |
| [case_service.py](file:///c:/MedMap/backend/app/services/case_service.py) | CRUD business logic |
| [database.py](file:///c:/MedMap/backend/app/core/database.py) | PostgreSQL connection via SQLAlchemy |

---

## 5. Existing Design Language

### Color Tokens (from [index.css](file:///c:/MedMap/src/index.css#L3-L16))
| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#fdfbf7` | Warm off-white background |
| `--color-surface` | `#ffffff` | Card backgrounds |
| `--color-navy` | `#0f172a` | Primary text, borders |
| `--color-text-secondary` | `#475569` | Secondary text |
| `--color-accent` | `#06b6d4` | Teal/cyan accent |
| `--color-verify` | `#10b981` | Green for verified items |
| `--color-warning` | `#f59e0b` | Amber/orange warnings |

### Typography
- **Sans:** `Inter` (font-sans, body text)
- **Handwritten:** `Kalam` (font-hand, logos, headings)
- Imported via Google Fonts

### Design Characteristics
- **Background:** Subtle dot grid pattern (radial gradient) on body
- **Cards:** Hand-drawn wobbly border-radius (`255px 15px 225px 15px/15px 225px 15px 255px`), navy borders, box-shadow offset, hover lift + rotate
- **Logo:** Kalam font, rotated -2deg, teal underline
- **Marquee:** Fixed top banner with scrolling text animation
- **Layout:** `.container` max-width 1000px, 2rem padding
- **Responsive:** Basic 600px breakpoint for hero text + banner sizing

### What exists as reusable
- ✅ `Card` component (title + description + optional verify highlight)
- ✅ `Badge` marquee component
- ✅ CSS design tokens and `.card`, `.container`, `.hero`, `.logo` classes
- ❌ No reusable Button component
- ❌ No reusable Input/Form component
- ❌ No reusable Loading/Spinner component
- ❌ No reusable Error display component
- ❌ No chat/message bubble component

---

## 6. Existing Loading / Error / Progress Behavior

| Behavior | PatientIntakePage | PatientOnboardingPage |
|---|---|---|
| Loading | `isLoading` → "Loading case…" text | `isLoading` → button text change |
| Error | `error` → red text `<div>` | `error` → red text `<div>` |
| Updating | `isUpdating` → disabled button + text change | N/A |
| Progress | ❌ None | ❌ None |

> [!NOTE]
> Loading/error patterns are **inline ad-hoc** — no shared component. Both pages repeat the same `{error && <div style={{ color: 'red' }}>{error}</div>}` pattern.

---

## 7. Current API / Context Dependencies

### CaseContext
- Stores only `caseId: string | null`
- Persisted in `sessionStorage` under key `activeCaseId`
- **Does NOT store:** intake answers, question progress, chat history, clinical data
- Survives page refresh ✅ (sessionStorage)
- Lost on tab close / session end ✅ (by design)

### API Endpoints Used by Intake
| Endpoint | Frontend Function | Used By |
|---|---|---|
| `POST /api/v1/cases` | `createCase(patientId, language, consent)` | PatientOnboardingPage |
| `GET /api/v1/cases/{caseId}` | `getCase(caseId)` | PatientIntakePage |
| `PUT /api/v1/cases/{caseId}` | `updateCaseStatus(caseId, status)` | PatientIntakePage |

> [!IMPORTANT]
> There is **no intake questioning API** — no endpoint for submitting answers, getting next questions, or retrieving conversation history. The backend only has CRUD for `ClinicalCase` metadata.

---

## 8. Likely Files to Modify for Day-1 Intake UI

### Primary (must modify)
| File | Reason |
|---|---|
| [PatientIntakePage.tsx](file:///c:/MedMap/src/pages/patient/PatientIntakePage.tsx) | Replace case-detail placeholder with actual intake chat/questionnaire UI |
| [index.css](file:///c:/MedMap/src/index.css) | Add styles for chat bubbles, message input, progress bar, intake-specific layout |

### Likely new files
| File | Reason |
|---|---|
| `src/components/intake/` (new directory) | Chat bubble, message input, progress indicator, question card components |

### Possible modifications
| File | Reason |
|---|---|
| [api.ts](file:///c:/MedMap/src/utils/api.ts) | Add mock intake API functions or deterministic question logic |
| [CaseContext.tsx](file:///c:/MedMap/src/context/CaseContext.tsx) | Potentially extend to hold intake conversation state (or create a separate IntakeContext) |

### Likely untouched
| File | Reason |
|---|---|
| [App.tsx](file:///c:/MedMap/src/App.tsx) | Route `/patient/intake` already exists |
| [main.tsx](file:///c:/MedMap/src/main.tsx) | Provider structure already correct |
| Backend files | Day-1 should use frontend-only mock/deterministic data |

---

## 9. Architecture Concerns & Escalations

### ⚠️ No Architecture Escalations Required for Day-1

If the Day-1 scope is **frontend-only with mock/deterministic questioning** (no real AI backend), then:

- ✅ No backend API changes needed (mock questions in frontend)
- ✅ No database/schema changes needed
- ✅ No shared TypeScript contract changes needed (existing `ClinicalHistory` in `unifiedCase.ts` already models structured history output)
- ✅ No routing architecture changes needed (`/patient/intake` route exists)
- ✅ No new major dependencies needed (React + react-router-dom is sufficient)
- ✅ No CaseContext architecture changes strictly needed (can add local state or optional IntakeContext without disrupting existing flow)
- ✅ No modification of another developer's module needed

### Future Architecture Items (NOT Day-1 blockers)

> [!WARNING]
> These are **not blockers** for Day-1 but will become relevant:
> 
> - **Intake API endpoints** — Backend has no question/answer submission endpoint. Will need `POST /api/v1/cases/{caseId}/intake/answer` or similar.
> - **CaseContext expansion** — Currently only holds `caseId`. For real intake, needs conversation history, question progress. Consider a separate `IntakeContext` to avoid bloating.
> - **`ClinicalCase` type expansion** — Frontend `ClinicalCase` has no field for intake progress or conversation data. Backend model mirrors this.
> - **Voice/speech input** — Listed as a feature on landing page. Will require Web Speech API integration or similar.

---

## 10. Blockers

**None identified for Day-1 frontend-only intake UI.**

The existing structure provides:
- ✅ A clean route at `/patient/intake`
- ✅ A `CaseContext` with sessionStorage persistence  
- ✅ A design system with tokens, fonts, and a distinctive hand-drawn aesthetic
- ✅ Basic loading/error patterns to extend
- ✅ TypeScript types for clinical history output structure (`ClinicalHistory`, `UnifiedCase`)

The [PatientIntakePage](file:///c:/MedMap/src/pages/patient/PatientIntakePage.tsx) is a clean slate — currently just a case-detail viewer that can be replaced wholesale with the intake chat UI without breaking any other page's functionality.

---

## File Tree Summary

```
c:\MedMap\
├── src/
│   ├── main.tsx                          # Entry: BrowserRouter + CaseProvider
│   ├── App.tsx                           # Routes (7 routes defined)
│   ├── index.css                         # Design system (198 lines)
│   ├── App.css                           # Vite scaffold leftover (unused by patient)
│   ├── components/
│   │   ├── Card.tsx                      # Shared card component
│   │   └── Badge.tsx                     # Marquee banner component
│   ├── context/
│   │   └── CaseContext.tsx               # caseId state + sessionStorage
│   ├── pages/
│   │   ├── LandingPage.tsx               # Landing with feature cards
│   │   ├── NotFoundPage.tsx              # 404
│   │   ├── patient/
│   │   │   ├── PatientOnboardingPage.tsx  # Creates case → navigates to intake
│   │   │   ├── PatientIntakePage.tsx      # ⭐ TARGET: Currently placeholder
│   │   │   ├── PatientDocumentsPage.tsx   # Stub
│   │   │   └── PatientVerificationPage.tsx # Stub
│   │   └── doctor/
│   │       ├── DoctorCasesPage.tsx        # Stub
│   │       └── DoctorCaseDetailPage.tsx   # Stub
│   ├── types/
│   │   ├── index.ts                      # Barrel export
│   │   ├── case.ts                       # ClinicalCase, CaseStatus
│   │   ├── patient.ts                    # Patient
│   │   ├── unifiedCase.ts               # UnifiedCase, ClinicalHistory
│   │   ├── trust.ts                      # Evidence, verification types
│   │   └── document.ts                   # Document types
│   └── utils/
│       └── api.ts                        # createCase, getCase, updateCaseStatus
├── backend/
│   └── app/
│       ├── main.py                       # FastAPI app
│       ├── api/v1/cases.py               # POST/GET/PUT /cases
│       ├── schemas/case.py               # Pydantic models
│       ├── models/case.py                # SQLAlchemy model
│       ├── services/case_service.py      # CRUD logic
│       └── core/database.py              # PostgreSQL connection
└── package.json                          # React 19 + react-router-dom 7 + Vite 8
```
