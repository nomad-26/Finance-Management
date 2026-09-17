import React, { useState, useEffect } from 'react';
import { X, Building } from 'lucide-react';
import { RentalComplex, RentalStatus } from '../types/rental.types';

interface ComplexModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { complexName: string; location: string; status: RentalStatus }) => Promise<void>;
  complexToEdit?: RentalComplex | null;
}

export const ComplexModal: React.FC<ComplexModalProps> = ({
  isOpen,
  onClose,
  onSave,
  complexToEdit
}) => {
  const [complexName, setComplexName] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<RentalStatus>('ACTIVE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (complexToEdit) {
      setComplexName(complexToEdit.complexName);
      setLocation(complexToEdit.location);
      setStatus(complexToEdit.status);
    } else {
      setComplexName('');
      setLocation('');
      setStatus('ACTIVE');
    }
    setError('');
  }, [complexToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complexName.trim()) {
      setError('Complex name is required');
      return;
    }
    if (!location.trim()) {
      setError('Location is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onSave({
        complexName: complexName.trim(),
        location: location.trim(),
        status
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save complex');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ maxWidth: '440px', padding: 0 }}>
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building size={18} color="var(--primary)" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {complexToEdit ? `Edit Complex (${complexToEdit.complexId})` : 'Create New Complex'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: '16px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#dc2626',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                COMPLEX NAME *
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="e.g. ABC Complex, City Center"
                value={complexName}
                onChange={(e) => setComplexName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                LOCATION / CITY *
              </label>
              <input
                type="text"
                className="input-control"
                placeholder="e.g. Salem, Main Road"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>
                STATUS
              </label>
              <select
                className="select-control"
                value={status}
                onChange={(e) => setStatus(e.target.value as RentalStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive (Disabled)</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : complexToEdit ? 'Update Complex' : 'Create Complex'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
