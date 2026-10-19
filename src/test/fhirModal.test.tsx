import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import * as api from '../utils/api';

vi.mock('../utils/api');

describe('FHIR Bundle Modal & Viewer in Doctor Case Detail', () => {
  const mockBundle = {
    resourceType: 'Bundle',
    type: 'document',
    entry: [
      { resource: { resourceType: 'Patient', id: 'pat-1' } },
      { resource: { resourceType: 'Encounter', id: 'enc-1' } },
      { resource: { resourceType: 'Condition', id: 'cond-1' } },
      { resource: { resourceType: 'MedicationRequest', id: 'med-1' } },
      { resource: { resourceType: 'Observation', id: 'obs-1' } },
      { resource: { resourceType: 'Observation', id: 'obs-2' } },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'test-token');
  });

  it('warns when trying to open FHIR Bundle before case is finalized', async () => {
    const unfinalizedCase: any = {
      caseId: 'case-in-review',
      patientId: 'patient-1',
      status: 'doctor_review',
      language: 'en',
      consultationType: 'general',
      intakeAnswers: {},
      derivedClinicalData: {},
    };

    vi.mocked(api.getCase).mockResolvedValue(unfinalizedCase);
    vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
    vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
      redFlags: [],
      missingInformation: [],
      confidenceAssessment: {},
    });
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={['/doctor/cases/case-in-review']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /FHIR Bundle/i })).toBeInTheDocument();
    });

    // In DoctorCaseDetailPage, when unfinalized, button has disabled attribute or title explaining why
    const fhirButton = screen.getByRole('button', { name: /FHIR Bundle/i });
    expect(fhirButton).toBeDisabled();
    expect(fhirButton).toHaveAttribute('title', expect.stringContaining('only available after case is finalized'));
  });

  it('opens modal, renders resource chips with counts, and displays JSON view when case is completed', async () => {
    const completedCase: any = {
      caseId: 'case-completed-1',
      patientId: 'patient-1',
      status: 'completed',
      language: 'en',
      consultationType: 'general',
      intakeAnswers: {},
      derivedClinicalData: {},
    };

    vi.mocked(api.getCase).mockResolvedValue(completedCase);
    vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
    vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
      redFlags: [],
      missingInformation: [],
      confidenceAssessment: {},
    });
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
    vi.mocked(api.getFhirBundle).mockResolvedValue(mockBundle);

    render(
      <MemoryRouter initialEntries={['/doctor/cases/case-completed-1']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /FHIR Bundle/i }).length).toBeGreaterThan(0);
    });

    const fhirButton = screen.getAllByRole('button', { name: /FHIR Bundle/i })[0];
    expect(fhirButton).not.toBeDisabled();
    fireEvent.click(fhirButton);

    await waitFor(() => {
      expect(screen.getByText(/HL7 FHIR R4 Clinical Bundle/i)).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Verify resource chips inside modal
    expect(within(dialog).getByText(/Bundle Resources/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Patient')).toBeInTheDocument();
    expect(within(dialog).getByText('Encounter')).toBeInTheDocument();
    expect(within(dialog).getByText('Condition')).toBeInTheDocument();
    expect(within(dialog).getByText('MedicationRequest')).toBeInTheDocument();
    expect(within(dialog).getByText('Observation')).toBeInTheDocument();

    // Verify Copy and Download buttons exist
    expect(screen.getByRole('button', { name: /Copy JSON/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download \.json/i })).toBeInTheDocument();

    // Verify collapsible JSON structure is present
    expect(screen.getByText(/Collapse Pretty JSON/i)).toBeInTheDocument();
  });
});
