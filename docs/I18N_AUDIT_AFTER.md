# MedMap i18n Audit Report (Post-Fixes - AFTER)
Date: 2026-10-21T17:32:20.884Z

## Executive Summary
This audit inspects all patient-facing surfaces for English leaks when Kannada (`kn`) or Hindi (`hi`) is selected:
- **Dictionary (`src/i18n/strings.ts`)**: 329 English keys total.
  - Missing in Hindi (`hi`): **0** keys
  - Missing in Kannada (`kn`): **0** keys
  - Untranslated/Identical copy in Hindi: **0** keys
  - Untranslated/Identical copy in Kannada: **0** keys
  - Disallowed Latin in Hindi: **0** keys
  - Disallowed Latin in Kannada: **0** keys
- **Frontend Patient Files**: Total **0** leaked UI elements across 13 files.
- **Backend & API Leaks**: Total **48** error strings/untranslated definitions reaching the patient.

## Before vs After Comparison Summary

| Metric / Surface | Baseline (Before Fixes) | Current (Post-Fixes) | Status |
| :--- | :---: | :---: | :---: |
| **Total Dictionary Keys (`strings.ts`)** | 110 | 329 | **Expanded (+219)** |
| **Missing Keys in Hindi (`hi`)** | 90 | **0** | **CLEARED (0)** |
| **Missing Keys in Kannada (`kn`)** | 90 | **0** | **CLEARED (0)** |
| **Untranslated / Identical Copy (Hindi)** | 0 | **0** | **CLEARED (0)** |
| **Untranslated / Identical Copy (Kannada)** | 0 | **0** | **CLEARED (0)** |
| **Disallowed Latin Letters in Hindi Dictionary** | 1 | **0** | **CLEARED (0)** |
| **Disallowed Latin Letters in Kannada Dictionary** | 1 | **0** | **CLEARED (0)** |
| **Frontend UI Text not passed via `t()`** | 156 | **0** | **CLEARED (0)** |
| **Frontend UI Attributes (`placeholder`, `aria-*`) not localized** | 35 | **0** | **CLEARED (0)** |
| **Hardcoded Alert / Confirm / Toast / Error calls** | 11 | **0** | **CLEARED (0)** |
| **Dynamic Concat / Template Literals with English Words** | 34 | **0** | **CLEARED (0)** |
| **English Fallbacks (`|| '...'`)** | 22 | **0** | **CLEARED (0)** |
| **Total Frontend Leaks Across Patient Screens** | **258** | **0** | **100% ELIMINATED (0)** |

---

---

## 1. Dictionary Coverage (`src/i18n/strings.ts`)

| Metric | Hindi (`hi`) | Kannada (`kn`) |
| :--- | :--- | :--- |
| Missing Keys | 0 | 0 |
| Identical to English (Copy Leak) | 0 | 0 |
| Disallowed Latin Letters | 0 | 0 |

### Missing Keys in Hindi & Kannada
```

```

---

## 2. Frontend Patient-Facing Leaks

| File | Raw JSX Text | Attributes (`placeholder`, `aria-*`) | Hardcoded Calls (`alert`, `setError`) | Dynamic / Concat | Fallbacks (`|| '...'`) | Total Leaks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/pages/LandingPage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/pages/NotFoundPage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/pages/patient/PatientOnboardingPage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/pages/patient/PatientIntakePage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/pages/patient/PatientDocumentsPage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/pages/patient/PatientVerificationPage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/patient/InactivityCountdownBanner.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/Button.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/Badge.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/ErrorMessage.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/LoadingIndicator.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/StatusBadge.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| `src/components/EmptyState.tsx` | 0 | 0 | 0 | 0 | 0 | **0** |
| **Total** | **0** | **0** | **0** | **0** | **0** | **0** |

### Detailed Leaks by File


### `src/pages/LandingPage.tsx` (0 findings)







### `src/pages/NotFoundPage.tsx` (0 findings)







### `src/pages/patient/PatientOnboardingPage.tsx` (0 findings)







### `src/pages/patient/PatientIntakePage.tsx` (0 findings)







### `src/pages/patient/PatientDocumentsPage.tsx` (0 findings)







### `src/pages/patient/PatientVerificationPage.tsx` (0 findings)







### `src/components/patient/InactivityCountdownBanner.tsx` (0 findings)







### `src/components/Button.tsx` (0 findings)







### `src/components/Badge.tsx` (0 findings)







### `src/components/ErrorMessage.tsx` (0 findings)







### `src/components/LoadingIndicator.tsx` (0 findings)







### `src/components/StatusBadge.tsx` (0 findings)







### `src/components/EmptyState.tsx` (0 findings)







---

## 3. Backend & API Leaks Reaching Patient

| File | Line | Type | Sample Message |
| :--- | :--- | :--- | :--- |
| `src/utils/api.ts` | 344 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 347 | API Throw Error | `Failed to load cases` |
| `src/utils/api.ts` | 359 | API Throw Error | `Failed to load case documents` |
| `src/utils/api.ts` | 371 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 374 | API Throw Error | `Failed to load clinical intelligence` |
| `src/utils/api.ts` | 385 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 388 | API Throw Error | `Failed to load unified case` |
| `src/utils/api.ts` | 400 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 435 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 455 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 580 | API Throw Error | `Unauthorized` |
| `src/utils/api.ts` | 583 | API Throw Error | `Failed to load admin queue` |
| `src/utils/api.ts` | 598 | API Throw Error | `Failed to acknowledge alert` |
| `backend/app/api/v1/cases.py` | 24 | Backend HTTPException | `Explicit consent is required to create a case` |
| `backend/app/api/v1/cases.py` | 43 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 46 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 59 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 63 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 226 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 238 | Backend HTTPException | `Not authorized to update this case` |
| `backend/app/api/v1/cases.py` | 240 | Backend HTTPException | `Patients cannot mark case as completed` |
| `backend/app/api/v1/cases.py` | 243 | Backend HTTPException | `Patients cannot modify doctor review fields` |
| `backend/app/api/v1/cases.py` | 485 | Backend HTTPException | `Not authorized to upload to this case` |
| `backend/app/api/v1/cases.py` | 501 | Backend HTTPException | `Invalid metadata format` |
| `backend/app/api/v1/cases.py` | 508 | Backend HTTPException | `Must provide file or metadata` |
| `backend/app/api/v1/cases.py` | 513 | Backend HTTPException | `Not authorized to access these documents` |
| `backend/app/api/v1/cases.py` | 516 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 548 | Backend HTTPException | `Operation not permitted` |
| `backend/app/api/v1/cases.py` | 550 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 571 | Backend HTTPException | `Document not found` |
| `backend/app/api/v1/cases.py` | 577 | Backend HTTPException | `Document file not found on disk` |
| `backend/app/api/v1/cases.py` | 594 | Backend HTTPException | `Not authorized to access this document` |
| `backend/app/api/v1/cases.py` | 607 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 611 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 618 | Backend HTTPException | `Cannot generate AI summary: intake answers are empty` |
| `backend/app/api/v1/cases.py` | 626 | Backend HTTPException | `AI generated malformed response` |
| `backend/app/api/v1/cases.py` | 630 | Backend HTTPException | `AI Generation Failed` |
| `backend/app/api/v1/cases.py` | 632 | Backend HTTPException | `An unexpected error occurred during AI generation` |
| `backend/app/api/v1/cases.py` | 636 | Backend HTTPException | `Case not found during update` |
| `backend/app/api/v1/cases.py` | 647 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 651 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 680 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 684 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 701 | Backend HTTPException | `Not authorized to access this case` |
| `backend/app/api/v1/cases.py` | 707 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 734 | Backend HTTPException | `Case not found` |
| `backend/app/api/v1/cases.py` | 788 | Backend HTTPException | `Case not found` |
| `backend/app/services/interview_engine/ayush_questions.py` | 1 | AYUSH Questions Untranslated in Engine | `14 questions defined only in English` |

---
