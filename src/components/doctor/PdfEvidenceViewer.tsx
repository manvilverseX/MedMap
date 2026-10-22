import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchDocumentBlob, getDocumentHighlight, openDocumentFile, type DocumentHighlightResponse } from '../../utils/api';

// Set worker source for Vite / Vercel
if (typeof window !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch {
    // ignore in environments without worker support
  }
}

interface PdfEvidenceViewerProps {
  caseId: string;
  documentId: string;
  snippet?: string;
  pageHint?: number;
  initialBlob?: Blob | null;
  onClose?: () => void;
}

export const PdfEvidenceViewer: React.FC<PdfEvidenceViewerProps> = ({
  caseId,
  documentId,
  snippet,
  pageHint,
  initialBlob,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(pageHint || 1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [highlightData, setHighlightData] = useState<DocumentHighlightResponse | null>(null);
  const [isScannedOrImage, setIsScannedOrImage] = useState(false);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstHighlightRef = useRef<HTMLDivElement | null>(null);
  const blobRef = useRef<Blob | null>(initialBlob || null);

  // 1. Fetch file and highlight metadata concurrently
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadPdfAndHighlights = async () => {
      try {
        // Fetch blob if not provided
        let blob = blobRef.current;
        const promises: [Promise<Blob>, Promise<DocumentHighlightResponse>] = [
          blob ? Promise.resolve(blob) : fetchDocumentBlob(caseId, documentId),
          getDocumentHighlight(caseId, documentId, snippet, undefined, pageHint).catch(() => ({
            page: pageHint || 1,
            pageWidth: 0,
            pageHeight: 0,
            rects: [],
            matchType: 'none' as const,
          })),
        ];

        const [fetchedBlob, highlights] = await Promise.all(promises);
        if (!isMounted) return;

        blobRef.current = fetchedBlob;
        setHighlightData(highlights);

        // Check if it's an image
        if (fetchedBlob.type.startsWith('image/')) {
          setIsScannedOrImage(true);
          const objUrl = URL.createObjectURL(fetchedBlob);
          setImageObjectUrl(objUrl);
          setLoading(false);
          return;
        }

        // Load PDF via pdfjs-dist
        const arrayBuffer = await fetchedBlob.arrayBuffer();
        if (!isMounted) return;

        try {
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const doc = await loadingTask.promise;
          if (!isMounted) return;

          setPdfDoc(doc);
          setTotalPages(doc.numPages);

          const targetPage = highlights.page && highlights.page <= doc.numPages ? highlights.page : 1;
          setCurrentPage(targetPage);
          setLoading(false);
        } catch (pdfErr: any) {
          console.warn('PDF parsing error, attempting image fallback:', pdfErr);
          setIsScannedOrImage(true);
          const objUrl = URL.createObjectURL(fetchedBlob);
          setImageObjectUrl(objUrl);
          setLoading(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load PDF document');
        setLoading(false);
      }
    };

    loadPdfAndHighlights();

    return () => {
      isMounted = false;
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
      }
    };
  }, [caseId, documentId, snippet, pageHint]);

  // 2. Render page when pdfDoc, currentPage, or scale changes
  useEffect(() => {
    if (!pdfDoc || isScannedOrImage) return;

    let isMounted = true;
    let renderTask: any = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (!isMounted) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (isMounted) {
          setCanvasDimensions({ width: viewport.width, height: viewport.height });
          if (firstHighlightRef.current) {
            firstHighlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', e);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale, isScannedOrImage]);

  // Pagination handlers
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };
  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.75));

  // Overlay rect scaling
  const renderHighlightOverlays = () => {
    if (!highlightData || highlightData.page !== currentPage || !canvasDimensions) {
      return null;
    }

    const { pageWidth, pageHeight, rects } = highlightData;
    if (!pageWidth || !pageHeight || rects.length === 0) return null;

    const scaleX = canvasDimensions.width / pageWidth;
    const scaleY = canvasDimensions.height / pageHeight;

    return (
      <div
        className="pdf-highlight-overlay-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: canvasDimensions.width,
          height: canvasDimensions.height,
          pointerEvents: 'none',
        }}
      >
        {rects.map((rect, idx) => {
          const left = rect.x0 * scaleX;
          const top = rect.y0 * scaleY;
          const width = (rect.x1 - rect.x0) * scaleX;
          const height = (rect.y1 - rect.y0) * scaleY;

          return (
            <div
              key={idx}
              ref={idx === 0 ? firstHighlightRef : undefined}
              className="pdf-highlight-box"
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                backgroundColor: 'rgba(255, 235, 59, 0.45)',
                border: '1.5px solid rgba(234, 179, 8, 0.85)',
                borderRadius: '3px',
                boxShadow: '0 0 6px rgba(250, 204, 21, 0.6)',
                pointerEvents: 'none',
              }}
              aria-label="Extracted entity highlight"
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="pdf-viewer-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '450px' }}>
      {/* Viewer Toolbar */}
      <div
        className="pdf-viewer-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.75rem',
          backgroundColor: '#f1f5f9',
          borderBottom: '1px solid var(--color-border)',
          borderRadius: '6px 6px 0 0',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {/* Pagination controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className="btn-item-ctrl"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isScannedOrImage}
            aria-label="Previous Page"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
          >
            ◀ Prev
          </button>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-navy)' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="btn-item-ctrl"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || isScannedOrImage}
            aria-label="Next Page"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
          >
            Next ▶
          </button>
        </div>

        {/* Zoom controls & External file opener */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className="btn-item-ctrl"
            onClick={handleZoomOut}
            aria-label="Zoom Out"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
          >
            🔍 -
          </button>
          <span style={{ fontSize: '0.8rem', minWidth: '40px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn-item-ctrl"
            onClick={handleZoomIn}
            aria-label="Zoom In"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
          >
            🔍 +
          </button>
          <button
            type="button"
            className="btn-item-ctrl"
            onClick={() => openDocumentFile(caseId, documentId)}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', backgroundColor: '#e2e8f0', color: 'var(--color-navy)' }}
          >
            Open full file ↗
          </button>
        </div>
      </div>

      {/* Match Status / Disclaimer Banner */}
      {highlightData && (
        <div
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.8rem',
            backgroundColor:
              highlightData.matchType === 'exact'
                ? '#fefce8'
                : highlightData.matchType === 'fuzzy'
                ? '#fff7ed'
                : '#f8fafc',
            borderBottom: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div>
            {highlightData.matchType === 'exact' && (
              <span style={{ color: '#854d0e', fontWeight: 600 }}>
                🟡 Exact match highlighted on Page {highlightData.page}
              </span>
            )}
            {highlightData.matchType === 'fuzzy' && (
              <span style={{ color: '#c2410c', fontWeight: 600 }}>
                🟡 Approximate match highlighted on Page {highlightData.page}
              </span>
            )}
            {(highlightData.matchType === 'page_only' || highlightData.matchType === 'none' || isScannedOrImage) && (
              <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                Exact text could not be highlighted automatically; showing the page where it was found
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Legend: <span style={{ backgroundColor: 'rgba(255, 235, 59, 0.6)', padding: '0.1rem 0.35rem', borderRadius: '3px', border: '1px solid #eab308' }}>Yellow box = Extracted Entity</span>
          </div>
        </div>
      )}

      {/* Main PDF Content Viewport */}
      <div
        ref={containerRef}
        className="pdf-canvas-scroll-container"
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: '#525659',
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          minHeight: '380px',
          maxHeight: '65vh',
        }}
      >
        {loading ? (
          <div style={{ color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginTop: '3rem' }}>
            <span className="loading-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' }} />
            <span>Loading document preview...</span>
          </div>
        ) : error ? (
          <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '8px', textAlign: 'center', maxWidth: '400px', marginTop: '2rem' }}>
            <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '0.5rem' }}>📄</span>
            <p style={{ color: '#b91c1c', margin: '0 0 1rem', fontSize: '0.9rem' }}>{error}</p>
            <button
              type="button"
              className="btn-item-ctrl"
              onClick={() => openDocumentFile(caseId, documentId)}
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
            >
              Open Full File Instead
            </button>
          </div>
        ) : isScannedOrImage && imageObjectUrl ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={imageObjectUrl}
              alt="Medical Document"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
            />
          </div>
        ) : (
          <div
            className="pdf-page-wrapper"
            style={{
              position: 'relative',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              backgroundColor: '#ffffff',
              borderRadius: '2px',
              display: 'inline-block',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            {renderHighlightOverlays()}
          </div>
        )}
      </div>
    </div>
  );
};
