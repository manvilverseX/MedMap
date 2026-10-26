import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import * as api from '../utils/api';

vi.mock('../utils/api');

describe('Simulated HIS Handoff in Doctor Case Detail', () => {
  const mockReceipt: api.HisReceipt = {
    referenceId: 'HIS-SIM-8F2B1A9C4D3E5F6A',
    status: 'SIMULATED_ACCEPTED',
    timestamp: '2026-10-25T18:00:00.000Z',
    resourceCounts: {
      Composition: 1,
      Patient: 1,
      Encounter: 1,
      Condition: 2,
      total: 5,
    },
    bundleSizeBytes: 2450,
    simulation: true,
    note: 'Simulation: not connected to a real hospital information system',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'test-token');
  });

  it('disables HIS handoff button when case is not finalized', async () => {
    const unfinalizedCase: any = {
      caseId: 'case-unfinalized',
      patientId: 'pat-101',
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
      <MemoryRouter initialEntries={['/doctor/cases/case-unfinalized']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('btn-his-handoff')).toBeInTheDocument();
    });

    const hisButton = screen.getByTestId('btn-his-handoff');
    expect(hisButton).toBeDisabled();
    expect(screen.queryByTestId('btn-his-handoff-action')).not.toBeInTheDocument();
  });

  it('allows doctor to click Send to HIS on finalized case and renders receipt card', async () => {
    const finalizedCase: any = {
      caseId: 'case-finalized-99',
      patientId: 'pat-99',
      status: 'completed',
      language: 'en',
      consultationType: 'general',
      intakeAnswers: { chief_complaint: 'Fever' },
      clinicalAssessment: { diagnosis: 'Viral fever' },
      derivedClinicalData: {},
    };

    vi.mocked(api.getCase).mockResolvedValue(finalizedCase);
    vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
    vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
      redFlags: [],
      missingInformation: [],
      confidenceAssessment: {},
    });
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
    vi.mocked(api.handoffToHis).mockResolvedValue(mockReceipt);

    render(
      <MemoryRouter initialEntries={['/doctor/cases/case-finalized-99']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('btn-his-handoff-action')).toBeInTheDocument();
    });

    const hisButton = screen.getByTestId('btn-his-handoff-action');
    expect(hisButton).not.toBeDisabled();

    fireEvent.click(hisButton);

    await waitFor(() => {
      expect(api.handoffToHis).toHaveBeenCalledWith('case-finalized-99');
    });

    // Check receipt card display
    await waitFor(() => {
      expect(screen.getByText('HIS Handoff Receipt')).toBeInTheDocument();
    });

    // Verify visible label "Simulation: not connected to a real HIS"
    expect(screen.getByText('Simulation: not connected to a real HIS')).toBeInTheDocument();

    // Verify reference ID, status, and note
    expect(screen.getByTestId('his-receipt-reference-id')).toHaveTextContent('HIS-SIM-8F2B1A9C4D3E5F6A');
    expect(screen.getByTestId('his-receipt-status')).toHaveTextContent('SIMULATED_ACCEPTED');
    expect(screen.getByTestId('his-receipt-bundle-size')).toHaveTextContent('2450 bytes');
    expect(screen.getByTestId('his-receipt-note')).toHaveTextContent(
      'Simulation: not connected to a real hospital information system'
    );
  });
});
