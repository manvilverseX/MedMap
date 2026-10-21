import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCase } from '../../context/CaseContext';
import { uploadDocument, extractDocument, mapApiErrorToKey } from '../../utils/api';
import { ErrorMessage } from '../../components/ErrorMessage';
import { compressImageIfNeeded } from '../../utils/imageCompressor';
import { useT } from '../../i18n/useT';

// Max file size: 10 MB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
];

type DocumentStatus = 'idle' | 'selected' | 'processing' | 'success';

export function PatientDocumentsPage() {
  const { caseId } = useCase();
  const navigate = useNavigate();
  const { t } = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<DocumentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>(() => t('documentsUploadingWait'));

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileExtension = (filename: string): string => {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    return ext;
  };

  const validateFile = (file: File): string | null => {
    const ext = getFileExtension(file.name);
    const isMimeValid = ALLOWED_MIME_TYPES.includes(file.type);
    const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

    if (!isMimeValid && !isExtValid) {
      return t('documentsUnsupportedFormat');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return t('documentsFileSizeExceeded');
    }

    return null;
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      setStatus('idle');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedFile(file);
    setStatus('selected');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleDropzoneClick = () => {
    if (status === 'idle' || status === 'selected') {
      fileInputRef.current?.click();
    }
  };

  const handleDropzoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && (status === 'idle' || status === 'selected')) {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleStartProcessing = async () => {
    if (!selectedFile || !caseId) {
      if (!caseId) setError(t('documentsNoActiveCase'));
      return;
    }

    setStatus('processing');
    setError(null);
    setProcessingMessage(t('documentsUploadingWait'));

    try {
      let finalFile = selectedFile;
      finalFile = await compressImageIfNeeded(finalFile);
      const uploadedDoc = await uploadDocument(caseId, finalFile);

      setProcessingMessage(t('documentsExtractingWait'));
      await extractDocument(caseId, uploadedDoc.id);

      setStatus('success');
    } catch (err: any) {
      setError(t(mapApiErrorToKey(err)));
      setStatus('selected');
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setStatus('idle');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileBadgeType = (filename: string): string => {
    const ext = getFileExtension(filename);
    if (ext === '.pdf') return 'PDF';
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'IMG';
    return 'DOC';
  };

  return (
    <div className="container">
      <header>
        <div className="logo">{t('documentsHeading')}</div>
        <nav style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <Link to="/">{t('documentsNavHome')}</Link>
          <Link to="/patient/intake">{t('documentsNavIntake')}</Link>
          <Link to="/patient/verification">{t('documentsNavVerification')}</Link>
        </nav>
      </header>

      <main className="doc-intake-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="doc-step-indicator">
            <span>{t('documentsStepIndicator')}</span>
          </div>
          {caseId && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              {t('documentsActiveCase', { caseId })}
            </div>
          )}
        </div>

        <section className="doc-upload-card">
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-hand)', fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--color-navy)' }}>
              {t('documentsHeading')}
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
              {t('documentsSubtitle')}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <ErrorMessage 
              message={error} 
              onDismiss={() => setError(null)} 
            />
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            id="medical-document-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleInputChange}
            style={{ display: 'none' }}
            aria-label={t('documentsChooseFile')}
          />

          {/* Upload Dropzone (idle or drag state) */}
          {(status === 'idle' || dragActive) && (
            <div
              className={`doc-dropzone ${dragActive ? 'drag-active' : ''}`}
              onClick={handleDropzoneClick}
              onKeyDown={handleDropzoneKeyDown}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              tabIndex={0}
              role="button"
              aria-label={t('documentsDragDropDesc')}
            >
              <div className="doc-dropzone-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>

              <div>
                <h3 className="doc-dropzone-title">
                  {dragActive ? t('documentsDropPrompt') : t('documentsHeading')}
                </h3>
                <p className="doc-dropzone-desc" style={{ marginTop: '0.3rem' }}>
                  {t('documentsDragDropDesc')}
                </p>
              </div>

              <div className="doc-supported-specs">
                {t('documentsSupportedSpecs')}
              </div>

              <button
                type="button"
                className="doc-btn doc-btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {t('documentsChooseFileBtn')}
              </button>
            </div>
          )}

          {/* Skip Action for Idle State */}
          {status === 'idle' && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="doc-btn doc-btn-secondary"
                onClick={() => navigate('/patient/verification')}
              >
                {t('documentsSkipToVerification')}
              </button>
            </div>
          )}

          {/* Selected, Processing, or Success File View */}
          {selectedFile && status !== 'idle' && (
            <div className="doc-file-card">
              <div className="doc-file-header">
                <div className="doc-file-info">
                  <div className={`doc-file-icon ${getFileBadgeType(selectedFile.name).toLowerCase()}`}>
                    {getFileBadgeType(selectedFile.name)}
                  </div>
                  <div className="doc-file-details">
                    <h4>{selectedFile.name}</h4>
                    <div className="doc-file-meta">
                      <span>{formatFileSize(selectedFile.size)}</span>
                      <span>•</span>
                      <span>{t('documentsFileTypeLabel')} {getFileExtension(selectedFile.name).toUpperCase().replace('.', '')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  {status === 'selected' && (
                    <span className="doc-badge doc-badge-ready">
                      {t('documentsReadyToProcess')}
                    </span>
                  )}
                  {status === 'processing' && (
                    <span className="doc-badge doc-badge-processing">
                      <span className="spinner"></span> {t('documentsProcessing')}
                    </span>
                  )}
                  {status === 'success' && (
                    <span className="doc-badge doc-badge-success">
                      {t('documentsDocumentReady')}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar during simulated processing */}
              {status === 'processing' && (
                <div className="doc-progress-container">
                  <div className="doc-progress-bar" style={{ width: '100%', animation: 'pulse 1.5s infinite' }}></div>
                </div>
              )}

              {/* Success Banner */}
              {status === 'success' && (
                <div className="doc-alert doc-alert-success" style={{ marginTop: '1.25rem', marginBottom: '0' }} role="status">
                  <span style={{ fontSize: '1.2rem' }}>✅</span>
                  <div>
                    <strong>{t('documentsUploadComplete')}</strong>
                    <div style={{ marginTop: '0.2rem', fontSize: '0.9rem' }}>
                      {t('documentsUploadCompleteDesc')}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="doc-actions-row">
                {status === 'selected' && (
                  <>
                    <button
                      type="button"
                      className="doc-btn doc-btn-accent"
                      onClick={handleStartProcessing}
                    >
                      ⚙️ {t('documentsUpload')}
                    </button>

                    <button
                      type="button"
                      className="doc-btn doc-btn-danger"
                      onClick={handleRemove}
                    >
                      🗑️ {t('documentsRemoveFile')}
                    </button>
                  </>
                )}

                {status === 'processing' && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                    {processingMessage}
                  </div>
                )}

                {status === 'success' && (
                  <>
                    <button
                      type="button"
                      className="doc-btn doc-btn-success"
                      onClick={() => navigate('/patient/verification')}
                    >
                      {t('documentsGoToVerification')}
                    </button>

                    <button
                      type="button"
                      className="doc-btn doc-btn-secondary"
                      onClick={handleRemove}
                    >
                      {t('documentsUploadAnother')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* AI Extraction Note */}
          <div className="doc-prototype-notice">
            ℹ️ <strong>{t('documentsNoticePrefix')}</strong> {t('documentsNotice')}
          </div>
        </section>
      </main>
    </div>
  );
}
