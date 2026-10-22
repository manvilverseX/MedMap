import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PdfEvidenceViewer } from '../components/doctor/PdfEvidenceViewer';
import * as api from '../utils/api';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  const mockRenderTask = {
    promise: Promise.resolve(),
    cancel: vi.fn(),
  };

  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
    render: vi.fn().mockReturnValue(mockRenderTask),
  };

  const mockDoc = {
    numPages: 3,
    getPage: vi.fn().mockResolvedValue(mockPage),
  };

  return {
    getDocument: vi.fn().mockReturnValue({
      promise: Promise.resolve(mockDoc),
    }),
    GlobalWorkerOptions: {
      workerSrc: '',
    },
  };
});

describe('PdfEvidenceViewer component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock HTMLCanvasElement.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
    }) as any;

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();

    // Mock fetchDocumentBlob
    vi.spyOn(api, 'fetchDocumentBlob').mockResolvedValue(
      new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' })
    );
  });

  it('renders toolbar, loads PDF and renders exact match highlight overlay', async () => {
    vi.spyOn(api, 'getDocumentHighlight').mockResolvedValue({
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x0: 50, y0: 100, x1: 200, y1: 120 }],
      matchType: 'exact',
    });

    render(
      <PdfEvidenceViewer
        caseId="case-1"
        documentId="doc-1"
        snippet="Metformin 500 mg"
      />
    );

    // Initial loading or page display
    expect(await screen.findByText(/Page 1 of 3/i)).toBeInTheDocument();
    expect(await screen.findByText(/Exact match highlighted on Page 1/i)).toBeInTheDocument();

    // Toolbar buttons
    expect(screen.getByLabelText(/Previous Page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Next Page/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zoom In/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zoom Out/i)).toBeInTheDocument();
    expect(screen.getByText(/Open full file ↗/i)).toBeInTheDocument();

    // Overlay box rendered
    const highlightBox = await screen.findByLabelText(/Extracted entity highlight/i);
    expect(highlightBox).toBeInTheDocument();
    expect(highlightBox).toHaveStyle({ position: 'absolute' });
  });

  it('handles page navigation and zoom', async () => {
    vi.spyOn(api, 'getDocumentHighlight').mockResolvedValue({
      page: 1,
      pageWidth: 612,
      pageHeight: 792,
      rects: [],
      matchType: 'none',
    });

    render(
      <PdfEvidenceViewer
        caseId="case-1"
        documentId="doc-1"
      />
    );

    expect(await screen.findByText(/Page 1 of 3/i)).toBeInTheDocument();

    // Next page
    const nextBtn = screen.getByLabelText(/Next Page/i);
    fireEvent.click(nextBtn);
    expect(await screen.findByText(/Page 2 of 3/i)).toBeInTheDocument();

    // Zoom in
    const zoomInBtn = screen.getByLabelText(/Zoom In/i);
    fireEvent.click(zoomInBtn);
    // 120% -> 145%
    expect(await screen.findByText(/145%/i)).toBeInTheDocument();
  });

  it('displays honest fallback notice when matchType is page_only or none', async () => {
    vi.spyOn(api, 'getDocumentHighlight').mockResolvedValue({
      page: 2,
      pageWidth: 612,
      pageHeight: 792,
      rects: [],
      matchType: 'page_only',
    });

    render(
      <PdfEvidenceViewer
        caseId="case-1"
        documentId="doc-scanned"
        snippet="Lab report test"
      />
    );

    expect(
      await screen.findByText(/Exact text could not be highlighted automatically; showing the page where it was found/i)
    ).toBeInTheDocument();
  });
});
