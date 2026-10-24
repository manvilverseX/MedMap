import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DoctorCaseDetailPage } from '../pages/doctor/DoctorCaseDetailPage';
import * as api from '../utils/api';

vi.mock('../utils/api');

describe('Doctor Item Controls (Accept, Edit, Reject, Evidence)', () => {
  const mockDoctorCase: any = {
    caseId: 'doc-review-case',
    patientId: 'patient-456',
    status: 'doctor_review',
    language: 'en',
    consultationType: 'general',
    intakeAnswers: {
      allergies: 'Penicillin allergy',
    },
    derivedClinicalData: {
      medicalEntities: {
        diagnoses: ['Type 2 Diabetes'],
        medications: [{ name: 'Metformin', dose: '500mg', frequency: 'Twice daily' }],
        investigations: [{ testName: 'HbA1c', value: '7.8', unit: '%' }],
        procedures: [],
      },
      doctorReviews: {},
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('medmap_token', 'doctor-jwt-token');
    vi.mocked(api.getCase).mockResolvedValue(mockDoctorCase);
    vi.mocked(api.getCaseDocuments).mockResolvedValue([]);
    vi.mocked(api.getClinicalIntelligence).mockResolvedValue({
      redFlags: [],
      missingInformation: [],
      confidenceAssessment: {},
    });
    vi.mocked(api.getUnifiedCase).mockResolvedValue(null);
  });

  it('allows doctor to accept an extracted entity', async () => {
    vi.mocked(api.reviewClinicalItem).mockResolvedValueOnce({
      caseId: 'doc-review-case',
      doctorReviews: {
        'diagnoses.0': { action: 'accepted', reviewedAt: new Date().toISOString() },
      },
    });

    render(
      <MemoryRouter initialEntries={['/doctor/cases/doc-review-case']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    });

    const acceptButtons = screen.getAllByRole('button', { name: /✓ Accept/i });
    expect(acceptButtons.length).toBeGreaterThan(0);

    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      expect(api.reviewClinicalItem).toHaveBeenCalledWith(
        'doc-review-case',
        expect.objectContaining({
          action: 'accepted',
          itemId: '0',
          itemType: 'diagnoses',
        })
      );
    });
  });

  it('allows doctor to reject an extracted entity, marking it struck', async () => {
    vi.mocked(api.reviewClinicalItem).mockResolvedValueOnce({
      caseId: 'doc-review-case',
      doctorReviews: {
        'diagnoses.0': { action: 'rejected', reviewedAt: new Date().toISOString() },
      },
    });

    render(
      <MemoryRouter initialEntries={['/doctor/cases/doc-review-case']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    });

    const rejectButtons = screen.getAllByRole('button', { name: /✕ Reject/i });
    expect(rejectButtons.length).toBeGreaterThan(0);

    fireEvent.click(rejectButtons[0]);

    await waitFor(() => {
      expect(api.reviewClinicalItem).toHaveBeenCalledWith(
        'doc-review-case',
        expect.objectContaining({
          action: 'rejected',
          itemId: '0',
          itemType: 'diagnoses',
        })
      );
    });
  });

  it('allows doctor to open evidence modal to inspect source document snippet', async () => {
    render(
      <MemoryRouter initialEntries={['/doctor/cases/doc-review-case']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    });

    const evidenceButtons = screen.getAllByRole('button', { name: /🔍 Evidence/i });
    expect(evidenceButtons.length).toBeGreaterThan(0);

    fireEvent.click(evidenceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Source Evidence & Provenance/i)).toBeInTheDocument();
      expect(screen.getByText(/Source Provenance/i)).toBeInTheDocument();
    });
  });

  it('renders collapsible extracted text panel for uploaded documents with machine-read notice and copy button', async () => {
    const mockDoc = {
      id: 'doc-test-1',
      caseId: 'doc-review-case',
      filename: 'blood_report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 15420,
      createdAt: new Date().toISOString(),
      extractionStatus: 'completed',
      extractedText: '--- Page 1 ---\nFasting Blood Sugar: 126 mg/dL\nHbA1c: 7.2 %',
      medicalEntities: {
        diagnoses: ['Diabetes Mellitus'],
        medications: [],
        investigations: [{ testName: 'HbA1c', value: '7.2', unit: '%' }],
      },
    };

    vi.mocked(api.getCaseDocuments).mockResolvedValueOnce([mockDoc]);

    render(
      <MemoryRouter initialEntries={['/doctor/cases/doc-review-case']}>
        <Routes>
          <Route path="/doctor/cases/:caseId" element={<DoctorCaseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('blood_report.pdf')).toBeInTheDocument();
    });

    // Check extracted text summary toggle
    expect(screen.getByText('Extracted text')).toBeInTheDocument();

    // Check machine-read notice
    expect(screen.getByText(/Machine-read text, may contain errors\. Check the original file\./i)).toBeInTheDocument();

    // Check text content inside pre
    expect(screen.getByLabelText(/Extracted text for blood_report\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/Fasting Blood Sugar: 126 mg\/dL/i)).toBeInTheDocument();

    // Check copy button
    const copyBtn = screen.getByRole('button', { name: /Copy text/i });
    expect(copyBtn).toBeInTheDocument();
  });
});

