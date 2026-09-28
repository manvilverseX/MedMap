# MedMap — Manual QA Testing Checklist

This document provides a lightweight, deterministic manual QA protocol for MedMap's shared presentation components and workflow states. It verifies UI rendering, accessibility, and interactive states without introducing third-party testing dependencies.

---

## 1. Build and Static Quality Pre-Flight Checks

Before performing manual UI verification, execute the following commands in the repository root:

- [ ] **Typecheck and Production Build**:
  ```bash
  npm run build
  ```
  *Expected Result*: TypeScript compiler (`tsc -b`) exits with code `0`, and Vite generates production assets in `dist/` without errors or warnings.

- [ ] **Static Code Linting**:
  ```bash
  npm run lint
  ```
  *Expected Result*: Oxlint analyzes all files and reports `0 errors`.

- [ ] **Whitespace & Git Cleanliness**:
  ```bash
  git diff --check
  ```
  *Expected Result*: Exits cleanly with no trailing whitespace or merge conflict markers.

---

## 2. Immediate Shared Component Verification (Active Now)

These checks verify the shared presentation components implemented and owned by Madhu.

### A. `Button` Component (`src/components/Button.tsx`)

| Check | Test Steps / Configuration | Expected Visual / Behavioral Result |
| :--- | :--- | :--- |
| **a. Default / Primary** | Render `<Button>Click Me</Button>` | Background is dark navy (`var(--color-navy)`), text is white (`var(--color-surface)`), 2px solid navy border, and 3px neobrutalist drop shadow (`3px 3px 0px var(--color-navy)`). Cursor is pointer. |
| **b. Success Variant** | Render `<Button variant="success">Verify</Button>` | Background is emerald green (`var(--color-verify)`), text is navy (`var(--color-navy)`), 2px solid navy border, and 3px neobrutalist drop shadow. |
| **c. Outline Variant** | Render `<Button variant="outline">Cancel</Button>` | Background is white (`var(--color-surface)`), text is navy (`var(--color-navy)`), 2px solid navy border, and 3px neobrutalist drop shadow. |
| **d. Danger Variant** | Render `<Button variant="danger">Remove File</Button>` | Background is destructive red (`#ef4444`), text is white (`var(--color-surface)`), 2px solid navy border, and 3px neobrutalist drop shadow. |
| **e. Loading State** | Set `isLoading={true}` on `<Button>` | `aria-busy="true"` is set on `<button>`, `disabled` is applied, opacity reduces to `0.65`, cursor becomes `not-allowed`, and drop shadow is disabled (`none`). |
| **f. Disabled State** | Set `disabled={true}` on `<Button>` | Native `disabled` attribute present, clicks do not fire `onClick`, opacity is `0.65`, cursor is `not-allowed`, and shadow is `none`. |

### B. `ErrorMessage` Component (`src/components/ErrorMessage.tsx`)

| Check | Test Steps / Configuration | Expected Visual / Behavioral Result |
| :--- | :--- | :--- |
| **g. Basic Rendering** | Pass `message="An error occurred"` | Renders an alert box with `#fef2f2` background, `1.5px solid #ef4444` border, `#b91c1c` text, and alert-circle SVG. Returns `null` when `message` is empty/null. |
| **h. Retry Callback** | Pass `onRetry={() => handleRetry()}` | Displays a "Retry" button below message with `aria-label="Retry action"`. Clicking triggers the callback. |
| **i. Dismiss Callback** | Pass `onDismiss={() => handleDismiss()}` | Displays an "X" icon button at top-right with `aria-label="Dismiss error"`. Clicking triggers the callback. |
| **j. Accessibility** | Inspect DOM elements | Container possesses `role="alert"` and `aria-live="assertive"`. Screen readers announce message immediately on render. Buttons have accessible text. |

### C. `LoadingIndicator` Component (`src/components/LoadingIndicator.tsx`)

| Check | Test Steps / Configuration | Expected Visual / Behavioral Result |
| :--- | :--- | :--- |
| **k. Animation & A11y** | Render `<LoadingIndicator message="Loading..." />` | SVG spinner displays with rotating SVG arc (`<animateTransform>`). Contains visible message plus visually hidden clip-span (`rect(0, 0, 0, 0)`) for screen readers. Has `role="status"` and `aria-live="polite"`. |

### D. `StatusBadge` Component (`src/components/StatusBadge.tsx`)

| Check | Test Steps / Configuration | Expected Visual / Behavioral Result |
| :--- | :--- | :--- |
| **l. All Status Values** | Test all 4 `CaseStatus` states: | |
| 1. `intake` | `<StatusBadge status="intake" />` | Displays `"Intake in Progress"` with teal background tint and cyan border (`var(--color-accent)`). |
| 2. `patient_verifying` | `<StatusBadge status="patient_verifying" />` | Displays `"Patient Verifying"` with amber background tint and warning border (`var(--color-warning)`). |
| 3. `doctor_review` | `<StatusBadge status="doctor_review" />` | Displays `"Doctor Review"` with navy tint and dark navy border (`var(--color-navy)`). |
| 4. `completed` | `<StatusBadge status="completed" />` | Displays `"Completed"` with emerald tint and green border (`var(--color-verify)`). |

### E. `EmptyState` Component (`src/components/EmptyState.tsx`)

| Check | Test Steps / Configuration | Expected Visual / Behavioral Result |
| :--- | :--- | :--- |
| **m. Without Action** | `<EmptyState title="No Records Found" description="Nothing has been uploaded yet." />` | Renders 2px dashed navy container, circular icon container with neutral SVG, bold title, and secondary description. `role="status"` applied. |
| **m. With Action** | Pass `action={<Button>Create Case</Button>}` | Renders the action element centered with `1.25rem` top margin. Shared `<Button>` integrates seamlessly with no style collisions. |

---

## 3. Workflow Integration Expectations (Future Feature-Owner Verification)

These checks define the integration contract for feature owners (Harsh, Nipun, Laya, Kamal, Manvil) when integrating shared components into their respective modules.

### Patient Workflow (`src/pages/patient/`)
- [ ] **Onboarding Page (`PatientOnboardingPage.tsx`)**:
  - Empty Patient ID submits: HTML5 validation prevents submission.
  - Valid submission: Button displays `"Creating case..."`, becomes disabled, and navigates to `/patient/intake`.
  - API failure: `<ErrorMessage message="Failed to create case. Please try again." />` appears.
- [ ] **Intake Page (`PatientIntakePage.tsx`)**:
  - Initial load: Shows `<LoadingIndicator message="Loading case..." />`.
  - Case loaded: Shows details, status via `<StatusBadge status="intake" />`, and action button.
  - "Move to Verification": Transitions status to `patient_verifying`, badge updates reactively, button disables.
  - Missing case ID in session: Redirects cleanly to `/patient`.
- [ ] **Document Intake Integration (`PatientDocumentsPage.tsx` — Nipun)**:
  - Document upload / OCR in progress: Replace ad-hoc spinners with `<LoadingIndicator size="sm" />`.
  - File removal action: Use `<Button variant="danger">Remove</Button>`.
  - File validation error: Use `<ErrorMessage message={error} onDismiss={() => setError(null)} />`.
- [ ] **Patient Verification Integration (`PatientVerificationPage.tsx`)**:
  - Missing case or empty unified case: Render `<EmptyState title="No Case Available" description="Please complete intake before verifying." action={<Button onClick={...}>Go to Intake</Button>} />`.

### Doctor Workflow (`src/pages/doctor/`)
- [ ] **Doctor Cases Page (`DoctorCasesPage.tsx` — Laya)**:
  - Filter returns 0 cases: Replace bare text with `<EmptyState title="No Cases Found" description="No cases match your filter criteria." action={<Button variant="outline" onClick={resetFilters}>Reset Filters</Button>} />`.
  - Status column / cards: Use `<StatusBadge status={caseItem.status} />` for consistent cross-app lifecycle colors.
- [ ] **Doctor Case Detail Page (`DoctorCaseDetailPage.tsx` — Laya)**:
  - Unknown `caseId` in URL: Replace unstyled `case-not-found` text with `<EmptyState title="Case Not Found" description="The requested case does not exist or has been archived." action={<Button onClick={() => navigate('/doctor/cases')}>Return to Cases</Button>} />`.
  - Review decisions: "Accept" uses `<Button variant="success">`, "Modify" uses `<Button variant="outline">`, and "Reject" uses `<Button variant="danger">`.
