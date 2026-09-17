import React, { useState } from 'react';
import {
  X,
  Upload,
  FileText,
  ShieldCheck,
  HardDrive,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { apiService } from '../../services/api';
import { Customer } from '../../types';

export interface UploadKycModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSuccess: (updatedCustomer: Customer) => void;
}

const KYC_DOCUMENT_TYPES = [
  'Aadhaar Card',
  'PAN Card',
  'Address Proof',
  'Driving License',
  'Voter ID Card',
  'Passport',
  'Bank Passbook / Statement',
  'Ration Card',
  'Electricity / Utility Bill',
  'Rental Agreement',
  'Customer Photo',
  'Other KYC Document'
];

export const UploadKycModal: React.FC<UploadKycModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSuccess
}) => {
  const [docType, setDocType] = useState<string>('Aadhaar Card');
  const [docName, setDocName] = useState<string>('');
  const [docNumber, setDocNumber] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !customer) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file format. Only JPG, PNG, WEBP, and PDF files are supported.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('File size exceeds the 20MB limit.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    if (!docName.trim()) {
      setDocName(file.name.replace(/\.[^/.]+$/, ''));
    }

    if (file.type !== 'application/pdf') {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview('');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a KYC file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(10);

    try {
      const targetId = customer.customerId?.toString() || customer.id;
      const res = await apiService.uploadCustomerKyc(
        targetId,
        selectedFile,
        {
          documentType: docType,
          documentName: docName.trim() || selectedFile.name,
          documentNumber: docNumber.trim()
        },
        (pct) => setUploadProgress(Math.max(10, pct))
      );

      if (res && res.success && res.data) {
        setUploadProgress(100);
        setTimeout(() => {
          onSuccess(res.data);
          onClose();
        }, 400);
      } else {
        throw new Error(res?.message || 'Failed to upload KYC document to Google Drive.');
      }
    } catch (err: any) {
      setError(err?.message || 'Upload failed. Please check network connection.');
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2600,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-light)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(5, 150, 105, 0.1)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <HardDrive size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                Upload KYC Document
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Directly uploads to Google Drive folder: <strong style={{ color: '#059669' }}>Customers / {customer.customerId || customer.name}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            style={{
              background: 'none',
              border: 'none',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* FORM BODY */}
        <form onSubmit={handleUpload} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#dc2626',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* DOCUMENT TYPE */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required" style={{ fontSize: '12px', fontWeight: 800 }}>
              DOCUMENT TYPE
            </label>
            <select
              className="input-control"
              value={docType}
              disabled={isUploading}
              onChange={(e) => setDocType(e.target.value)}
              style={{ fontSize: '13px', height: '40px' }}
            >
              {KYC_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* DOCUMENT TITLE / NAME */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 800 }}>
              DOCUMENT LABEL / FILE NAME (OPTIONAL)
            </label>
            <input
              type="text"
              className="input-control"
              placeholder={`e.g. ${docType} Front & Back`}
              value={docName}
              disabled={isUploading}
              onChange={(e) => setDocName(e.target.value)}
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* ID NUMBER (OPTIONAL) */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 800 }}>
              DOCUMENT / ID PROOF NUMBER (OPTIONAL)
            </label>
            <input
              type="text"
              className="input-control"
              placeholder="e.g. 12-digit Aadhaar / 10-char PAN"
              value={docNumber}
              disabled={isUploading}
              onChange={(e) => setDocNumber(e.target.value)}
              style={{ fontSize: '13px' }}
            />
          </div>

          {/* FILE UPLOAD DROPZONE */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label required" style={{ fontSize: '12px', fontWeight: 800 }}>
              SELECT DOCUMENT FILE (PDF, JPG, PNG, WEBP)
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px 16px',
                border: '2px dashed var(--border-light, #cbd5e1)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center'
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                disabled={isUploading}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {selectedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {selectedFile.type === 'application/pdf' ? (
                    <FileText size={32} color="#ef4444" />
                  ) : preview ? (
                    <img
                      src={preview}
                      alt="Preview"
                      style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                    />
                  ) : (
                    <ShieldCheck size={32} color="#059669" />
                  )}
                  <div style={{ textAlign: 'left' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--text-dark)', display: 'block' }}>
                      {selectedFile.name}
                    </strong>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Document'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#059669', display: 'block', fontWeight: 700 }}>
                      Click to change file
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <Upload size={28} color="#059669" style={{ marginBottom: '8px' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-dark)' }}>
                    Choose a KYC File or Drag &amp; Drop here
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Supports PDF, JPG, JPEG, PNG, WEBP (Max 20MB)
                  </span>
                </>
              )}
            </label>
          </div>

          {/* UPLOAD PROGRESS BAR */}
          {isUploading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669' }}>
                  <Loader2 size={14} className="animate-spin" />
                  Uploading to Google Drive secure storage...
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{uploadProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: '#059669',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isUploading}
              style={{ fontSize: '13px' }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isUploading || !selectedFile}
              style={{
                fontSize: '13px',
                fontWeight: 700,
                gap: '6px',
                backgroundColor: '#059669',
                borderColor: '#059669'
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Uploading to Drive...</span>
                </>
              ) : (
                <>
                  <Upload size={15} />
                  <span>Upload to Google Drive</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
