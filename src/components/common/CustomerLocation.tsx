import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, RefreshCw, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon, Trash2 } from 'lucide-react';
import { CustomerLocationData } from '../../types';
import { locationService } from '../../services/locationService';

export interface CustomerLocationProps {
  location: CustomerLocationData | null;
  onChange: (location: CustomerLocationData | null) => void;
  onToast?: (msg: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const CustomerLocation: React.FC<CustomerLocationProps> = ({
  location,
  onChange,
  onToast
}) => {
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isResolvingLink, setIsResolvingLink] = useState<boolean>(false);
  const [mapsInputUrl, setMapsInputUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showReplaceInput, setShowReplaceInput] = useState<boolean>(false);

  const notify = (msg: string, type: 'info' | 'success' | 'warning' | 'error') => {
    if (onToast) onToast(msg, type);
  };

  // 1. Handle GPS Capture
  const handleCaptureGps = async () => {
    setErrorMessage('');
    setIsLocating(true);

    try {
      const captured = await locationService.captureGpsLocation();
      onChange(captured);
      setShowReplaceInput(false);
      notify('Customer location captured successfully via GPS', 'success');
    } catch (err: any) {
      const msg = err.message || 'Unable to capture current GPS location.';
      setErrorMessage(msg);
      notify(msg, 'error');
    } finally {
      setIsLocating(false);
    }
  };

  // 2. Handle Google Maps Link Resolution
  const handleResolveLink = async () => {
    setErrorMessage('');
    if (!mapsInputUrl.trim()) {
      const err = 'Please paste a valid Google Maps URL.';
      setErrorMessage(err);
      notify(err, 'error');
      return;
    }

    setIsResolvingLink(true);

    try {
      const resolved = await locationService.resolveGoogleMapsUrl(mapsInputUrl);
      onChange(resolved);
      setMapsInputUrl('');
      setShowReplaceInput(false);
      notify('Location added successfully from Google Maps link', 'success');
    } catch (err: any) {
      const msg = err.message || 'Invalid or unresolvable Google Maps URL.';
      setErrorMessage(msg);
      notify(msg, 'error');
    } finally {
      setIsResolvingLink(false);
    }
  };

  // 3. Clear / Remove Location
  const handleClearLocation = () => {
    if (window.confirm('Are you sure you want to remove the saved customer location?')) {
      onChange(null);
      setErrorMessage('');
      setMapsInputUrl('');
      setShowReplaceInput(false);
      notify('Saved customer location cleared', 'info');
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
        border: '1px solid var(--border-light, #e2e8f0)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '12px', color: 'var(--text-dark)' }}>
          CUSTOMER LOCATION (FOR VISITS & COLLECTION)
        </label>
        {location && (
          <span
            className="badge badge-success"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px' }}
          >
            <CheckCircle2 size={12} />
            <span>{location.source === 'gps' ? 'GPS Captured' : 'Google Maps Link'}</span>
          </span>
        )}
      </div>

      {/* Inline Error Display */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#dc2626',
            padding: '10px 12px',
            borderRadius: '6px',
            fontSize: '12.5px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* State A: Location Already Saved & Displayed */}
      {location && !showReplaceInput ? (
        <div>
          <div
            style={{
              backgroundColor: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: '6px',
              padding: '14px',
              marginBottom: '12px'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Latitude
                </span>
                <strong style={{ color: 'var(--text-dark)', fontFamily: 'monospace' }}>{location.latitude !== null && location.latitude !== undefined ? location.latitude.toFixed(6) : 'N/A'}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Longitude
                </span>
                <strong style={{ color: 'var(--text-dark)', fontFamily: 'monospace' }}>{location.longitude !== null && location.longitude !== undefined ? location.longitude.toFixed(6) : 'N/A'}</strong>
              </div>

              {location.accuracy && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                    GPS Accuracy
                  </span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>±{location.accuracy} m</span>
                </div>
              )}

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
                  Source
                </span>
                <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--text-dark)' }}>
                  {(location.source || location.locationMethod || 'gps').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a
              href={location.googleMapsUrl || `https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ExternalLink size={14} />
              <span>View on Map</span>
            </a>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Navigation size={14} />
              <span>Open Collection Route</span>
            </a>

            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCaptureGps} disabled={isLocating}>
              {isLocating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              <span>Recapture GPS</span>
            </button>

            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowReplaceInput(true)}>
              <LinkIcon size={13} />
              <span>Replace Link</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearLocation}
              style={{ color: '#dc2626', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              title="Remove location"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        /* State B: Uncaptured or Replace Input */
        <div>
          {/* Top GPS Capture Button */}
          <div style={{ marginBottom: '14px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCaptureGps}
              disabled={isLocating}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                height: '40px',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              {isLocating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Locating...</span>
                </>
              ) : (
                <>
                  <MapPin size={16} />
                  <span>Capture Current Location (GPS)</span>
                </>
              )}
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '12px 0',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px'
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light, #e2e8f0)' }}></div>
            <span style={{ padding: '0 10px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-light, #e2e8f0)' }}></div>
          </div>

          {/* Bottom Google Maps Link Input */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="url"
              className="input-control"
              placeholder="Paste Google Maps link (e.g. https://maps.app.goo.gl/...)"
              value={mapsInputUrl}
              onChange={(e) => setMapsInputUrl(e.target.value)}
              disabled={isResolvingLink}
              style={{ flex: 1, height: '38px', fontSize: '13px' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResolveLink}
              disabled={isResolvingLink || !mapsInputUrl.trim()}
              style={{ height: '38px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              {isResolvingLink ? <Loader2 size={14} className="animate-spin" /> : <LinkIcon size={14} />}
              <span>Use link</span>
            </button>
          </div>

          {showReplaceInput && (
            <div style={{ marginTop: '8px', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowReplaceInput(false)}
                style={{ fontSize: '11px' }}
              >
                Cancel Replace
              </button>
            </div>
          )}

          <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Capture the customer&apos;s location while visiting their premises, or paste a Google Maps share link. Location access requires browser/device permission.
          </p>
        </div>
      )}
    </div>
  );
};
