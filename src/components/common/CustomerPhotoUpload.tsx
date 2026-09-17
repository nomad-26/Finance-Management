import React, { useState, useEffect, useRef } from 'react';
import { Camera, Check, Upload, Trash2, Eye, RefreshCw, X, AlertCircle } from 'lucide-react';
import { WebcamCapture } from './WebcamCapture';

export interface CustomerPhotoUploadProps {
  photoFile?: File | null;
  photoUrl?: string | null;
  onChange?: (file: File | null, dataUrl: string | null) => void;
  onToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const CustomerPhotoUpload: React.FC<CustomerPhotoUploadProps> = ({
  photoFile,
  photoUrl,
  onChange,
  onToast
}) => {
  const [isWebcamOpen, setIsWebcamOpen] = useState<boolean>(false);
  const [localDataUrl, setLocalDataUrl] = useState<string | null>(photoUrl || null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync external props
  useEffect(() => {
    if (photoUrl !== undefined) {
      setLocalDataUrl(photoUrl);
    }
  }, [photoUrl]);

  useEffect(() => {
    if (photoFile !== undefined) {
      if (photoFile && !photoUrl) {
        const objectUrl = URL.createObjectURL(photoFile);
        setLocalDataUrl(objectUrl);
        return () => {
          URL.revokeObjectURL(objectUrl);
        };
      }
    }
  }, [photoFile, photoUrl]);

  const notifyToast = (msg: string, type: 'info' | 'success' | 'warning' | 'error') => {
    if (onToast) onToast(msg, type);
  };

  // Validate File
  const validateFile = (file: File): boolean => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      const err = `File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
      setErrorMessage(err);
      notifyToast(err, 'error');
      return false;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const validMime = ['image/jpeg', 'image/jpg', 'image/png'].includes(file.type.toLowerCase());
    const validExt = ['jpg', 'jpeg', 'png'].includes(ext || '');

    if (!validMime && !validExt) {
      const err = `Invalid file format "${ext}". Only JPG, JPEG, and PNG images are allowed.`;
      setErrorMessage(err);
      notifyToast(err, 'error');
      return false;
    }

    setErrorMessage('');
    return true;
  };

  // Handle File Picker Selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!validateFile(file)) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setLocalDataUrl(result);
      if (onChange) onChange(file, result);
      notifyToast('Customer photo uploaded successfully', 'success');
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle Webcam Capture
  const handleWebcamCapture = (file: File, dataUrl: string) => {
    setLocalDataUrl(dataUrl);
    setErrorMessage('');
    if (onChange) onChange(file, dataUrl);
    notifyToast('Webcam photo captured successfully', 'success');
  };

  // Clear Photo
  const handleRemovePhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalDataUrl(null);
    setErrorMessage('');
    if (onChange) onChange(null, null);
    notifyToast('Customer photo removed', 'info');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Photo Frame */}
      <div
        style={{
          position: 'relative',
          width: '140px',
          height: '160px',
          border: localDataUrl ? '2px solid var(--color-primary-accent)' : '2px dashed var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-surface-subtle)',
          color: 'var(--text-muted)',
          fontSize: '12px',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          boxShadow: localDataUrl ? 'var(--shadow-sm)' : 'none'
        }}
      >
        {localDataUrl ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img
              src={localDataUrl}
              alt="Customer Photo Preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />

            {/* Photo Attached Overlay Badge */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 700
              }}
            >
              <Check size={12} color="#10B981" />
              <span>Photo Attached</span>
            </div>

            {/* Hover Quick Action Buttons */}
            <div
              className="photo-action-overlay"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: 0,
                transition: 'opacity 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
            >
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(true)}
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-dark)'
                }}
                title="Full Preview"
              >
                <Eye size={16} />
              </button>

              <button
                type="button"
                onClick={() => setIsWebcamOpen(true)}
                style={{
                  background: 'rgba(255,255,255,0.9)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-dark)'
                }}
                title="Retake Webcam Photo"
              >
                <RefreshCw size={16} />
              </button>

              <button
                type="button"
                onClick={handleRemovePhoto}
                style={{
                  background: 'rgba(239, 68, 68, 0.9)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#fff'
                }}
                title="Remove Photo"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <Camera size={32} color="var(--text-muted)" />
            <span style={{ marginTop: '8px', color: 'var(--text-muted)', fontWeight: 600 }}>No photo</span>
          </>
        )}
      </div>

      {/* Buttons Row */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setIsWebcamOpen(true)}
        >
          <Camera size={13} />
          <span>Webcam</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={13} />
          <span>UPLOAD</span>
        </button>
      </div>

      {/* Error Message alert */}
      {errorMessage && (
        <div
          style={{
            fontSize: '11px',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            maxWidth: '160px',
            textAlign: 'center',
            marginTop: '2px'
          }}
        >
          <AlertCircle size={12} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Webcam Modal */}
      <WebcamCapture
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        onCapture={handleWebcamCapture}
      />

      {/* Lightbox / Preview Modal */}
      {isPreviewModalOpen && localDataUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={() => setIsPreviewModalOpen(false)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              backgroundColor: '#000',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsPreviewModalOpen(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              <X size={20} />
            </button>

            <img
              src={localDataUrl}
              alt="Customer Full Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                display: 'block',
                objectFit: 'contain'
              }}
            />
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-dark)',
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              Customer Profile / KYC Photo Preview
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
