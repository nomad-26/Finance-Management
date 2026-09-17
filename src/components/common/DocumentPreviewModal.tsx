import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  ShieldCheck,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { CustomerKycDocument, CustomerPhotoData } from '../../types';
import { apiService } from '../../services/api';

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CustomerKycDocument | CustomerPhotoData | null;
  customerName?: string;
  customerId?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  customerName,
  customerId
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoadingBlob, setIsLoadingBlob] = useState<boolean>(false);
  const [blobError, setBlobError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const doc = document as any;

  const isPdf = Boolean(
    doc?.mimeType === 'application/pdf' ||
    doc?.resourceType === 'raw' ||
    doc?.fileName?.toLowerCase().endsWith('.pdf') ||
    doc?.name?.toLowerCase().endsWith('.pdf') ||
    doc?.originalFileName?.toLowerCase().endsWith('.pdf')
  );

  const rawPreviewTarget =
    doc?.telegramFileId ||
    '';

  const docTitle =
    doc?.documentName ||
    doc?.fileName ||
    doc?.originalFileName ||
    `${doc?.documentType || 'Customer'} Document`;

  const docType = doc?.documentType || doc?.docType || 'Document';
  const sizeMb = doc?.fileSize
    ? (doc.fileSize / (1024 * 1024)).toFixed(2) + ' MB'
    : doc?.size
    ? (doc.size / (1024 * 1024)).toFixed(2) + ' MB'
    : '';

  // Load protected file blob with Bearer token authentication
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (!isOpen || !document) {
      setBlobUrl(null);
      setBlobError(null);
      setIsLoadingBlob(false);
      return;
    }

    // Direct data URI
    if (typeof rawPreviewTarget === 'string' && rawPreviewTarget.startsWith('data:')) {
      setBlobUrl(rawPreviewTarget);
      setBlobError(null);
      setIsLoadingBlob(false);
      return;
    }

    // Direct Google Drive link when no backend view route is needed
    if (typeof rawPreviewTarget === 'string' && rawPreviewTarget.includes('drive.google.com') && !doc?.fileId && !doc?.viewUrl) {
      setBlobUrl(rawPreviewTarget);
      setBlobError(null);
      setIsLoadingBlob(false);
      return;
    }

    const targetToFetch =
      doc?.fileId ||
      doc?.viewUrl ||
      doc?.url ||
      doc?.telegramFileId ||
      rawPreviewTarget;

    if (!targetToFetch) {
      setBlobUrl(null);
      setBlobError('No document preview source available.');
      setIsLoadingBlob(false);
      return;
    }

    setIsLoadingBlob(true);
    setBlobError(null);

    apiService
      .getFileBlob(targetToFetch)
      .then((res) => {
        if (!active) {
          if (res.blobUrl && !res.blobUrl.startsWith('data:')) {
            URL.revokeObjectURL(res.blobUrl);
          }
          return;
        }

        if (res.success && res.blobUrl) {
          createdUrl = res.blobUrl;
          setBlobUrl(res.blobUrl);
          setBlobError(null);
        } else {
          setBlobError(res.message || 'Unable to load document preview.');
          setBlobUrl(null);
        }
      })
      .catch((err: any) => {
        if (active) {
          setBlobError(err.message || 'Failed to authenticate and load document.');
          setBlobUrl(null);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingBlob(false);
        }
      });

    return () => {
      active = false;
      if (createdUrl && !createdUrl.startsWith('data:')) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isOpen, document, rawPreviewTarget]);

  if (!isOpen || !document) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleOpenFullView = async () => {
    if (blobUrl && !blobUrl.startsWith('http')) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const targetToFetch =
      doc?.fileId ||
      doc?.viewUrl ||
      doc?.telegramFileId ||
      doc?.url ||
      rawPreviewTarget;
    if (targetToFetch) {
      await apiService.viewProtectedDocument(targetToFetch);
    }
  };

  const handleDownload = async () => {
    if (blobUrl && !blobUrl.startsWith('http')) {
      const link = window.document.createElement('a');
      link.href = blobUrl;
      link.download = docTitle;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      return;
    }

    const downloadTarget = doc?.fileId || doc?.downloadUrl || doc?.viewUrl || rawPreviewTarget;
    if (downloadTarget) {
      setIsDownloading(true);
      await apiService.downloadProtectedFile(downloadTarget, docTitle);
      setIsDownloading(false);
    }
  };

  const handleRetry = () => {
    const targetToFetch =
      doc?.fileId ||
      doc?.viewUrl ||
      doc?.url ||
      doc?.telegramFileId ||
      rawPreviewTarget;

    if (!targetToFetch) return;

    setIsLoadingBlob(true);
    setBlobError(null);

    apiService
      .getFileBlob(targetToFetch)
      .then((res) => {
        if (res.success && res.blobUrl) {
          setBlobUrl(res.blobUrl);
          setBlobError(null);
        } else {
          setBlobError(res.message || 'Unable to load document preview.');
        }
      })
      .catch((err: any) => {
        setBlobError(err.message || 'Failed to authenticate and load document.');
      })
      .finally(() => {
        setIsLoadingBlob(false);
      });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2500,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border-light)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: isPdf ? 'rgba(239, 68, 68, 0.1)' : 'rgba(5, 150, 105, 0.1)',
                color: isPdf ? '#ef4444' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {isPdf ? <FileText size={22} /> : <ShieldCheck size={22} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark, #0f172a)' }}>
                  {docTitle}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0'
                  }}
                >
                  {docType}
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ShieldCheck size={12} color="#059669" />
                  Telegram Secure Storage
                </span>
              </div>

              {(customerName || customerId) && (
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {customerName ? `Customer: ${customerName}` : ''} {customerId ? `(${customerId})` : ''}
                  {sizeMb ? ` • ${sizeMb}` : ''}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleOpenFullView}
              style={{
                gap: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                backgroundColor: '#059669',
                borderColor: '#059669'
              }}
            >
              <ExternalLink size={14} />
              <span>Open Full View</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownload}
              disabled={isDownloading || (!blobUrl && !doc?.fileId && !doc?.downloadUrl)}
              style={{ gap: '6px', fontWeight: 600, fontSize: '12.5px' }}
              title="Download document"
            >
              <Download size={14} />
              <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Close Preview"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* CONTROLS TOOLBAR (FOR IMAGES) */}
        {!isPdf && blobUrl && (
          <div
            style={{
              padding: '8px 20px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}
            >
              <ZoomOut size={14} />
              <span>Zoom Out</span>
            </button>

            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', minWidth: '45px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}
            >
              <ZoomIn size={14} />
              <span>Zoom In</span>
            </button>

            <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-subtle)' }} />

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRotate}
              style={{ padding: '4px 10px', fontSize: '12px', gap: '4px' }}
            >
              <RotateCw size={14} />
              <span>Rotate</span>
            </button>

            {(zoom !== 1 || rotation !== 0) && (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: 'var(--color-primary-dark)',
                  textDecoration: 'underline'
                }}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* PREVIEW CONTAINER */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
            backgroundColor: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            maxHeight: 'calc(90vh - 140px)'
          }}
        >
          {isLoadingBlob ? (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', borderColor: '#059669', borderTopColor: 'transparent' }} />
              <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600 }}>Loading secure document preview...</p>
            </div>
          ) : blobError ? (
            <div style={{ textAlign: 'center', color: '#f87171', padding: '24px' }}>
              <AlertCircle size={44} style={{ margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#ffffff' }}>Unable to load document preview</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#94a3b8', maxWidth: '400px' }}>{blobError}</p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRetry}
                  style={{ gap: '6px' }}
                >
                  <RefreshCw size={14} />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleOpenFullView}
                  style={{ gap: '6px', backgroundColor: '#059669', borderColor: '#059669' }}
                >
                  <ExternalLink size={14} />
                  <span>Open Full View</span>
                </button>
              </div>
            </div>
          ) : isPdf && blobUrl ? (
            <div style={{ width: '100%', height: '550px', display: 'flex', flexDirection: 'column' }}>
              <iframe
                src={blobUrl}
                title={docTitle}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff'
                }}
              />
            </div>
          ) : blobUrl ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.2s ease',
                transform: `scale(${zoom}) rotate(${rotation}deg)`
              }}
            >
              <img
                src={blobUrl}
                alt={docTitle}
                style={{
                  maxWidth: '100%',
                  maxHeight: '65vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)'
                }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
              <FileText size={48} style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: '14px' }}>Preview unavailable for this document.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenFullView}
                style={{ marginTop: '14px', gap: '6px', backgroundColor: '#059669', borderColor: '#059669' }}
              >
                <ExternalLink size={14} />
                <span>Open Full View</span>
              </button>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: 'var(--text-muted)'
          }}
        >
          <div>
            <span>Stored under Google Drive path: </span>
            <strong style={{ color: 'var(--color-primary-dark)' }}>
              KKV GOLD FINANCE / Customers / {customerId || 'Customer'} / {doc?.fileName || docTitle}
            </strong>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
