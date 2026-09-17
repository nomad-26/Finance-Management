import React, { useState } from 'react';
import { MapPin, ExternalLink, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { StructuredAddress, LocationDetails } from '../../types';
import { buildGoogleMapsUrl, parseGoogleMapsCoordinates } from '../../utils/addressUtils';

export interface StructuredAddressInputProps {
  title: string;
  address: StructuredAddress;
  onChangeAddress: (addr: StructuredAddress) => void;
  location?: LocationDetails | null;
  onChangeLocation?: (loc: LocationDetails) => void;
  disabled?: boolean;
  isRequired?: boolean;
  onToast?: (msg: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const StructuredAddressInput: React.FC<StructuredAddressInputProps> = ({
  title,
  address,
  onChangeAddress,
  location,
  onChangeLocation,
  disabled = false,
  isRequired = true,
  onToast
}) => {
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string>('');
  const [locationMethod, setLocationMethod] = useState<'gps' | 'google_maps_url' | 'manual'>(
    location?.locationMethod || 'gps'
  );
  const [mapsUrlInput, setMapsUrlInput] = useState<string>(location?.googleMapsUrl || '');

  const notify = (msg: string, type: 'info' | 'success' | 'warning' | 'error') => {
    if (onToast) onToast(msg, type);
  };

  const handleFieldChange = (field: keyof StructuredAddress, value: string) => {
    onChangeAddress({
      ...address,
      [field]: value
    });
  };

  // GPS Location Capture handler
  const handleCaptureGps = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      const err = 'Geolocation is not supported by your browser.';
      setLocationError(err);
      notify(err, 'error');
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);
        const capturedAt = new Date().toLocaleString('en-IN');
        const googleMapsUrl = buildGoogleMapsUrl(lat, lng);

        const newLocation: LocationDetails = {
          latitude: lat,
          longitude: lng,
          accuracy,
          capturedAt,
          googleMapsUrl,
          locationMethod: 'gps'
        };

        if (onChangeLocation) onChangeLocation(newLocation);
        setIsLocating(false);
        notify(`${title} GPS location captured successfully!`, 'success');
      },
      (err) => {
        setIsLocating(false);
        let msg = 'Location permission was denied. Please enter the address manually or paste a Google Maps location URL.';
        if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Unable to detect device position. Please verify GPS settings.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS capture request timed out. You can enter the address manually.';
        }
        setLocationError(msg);
        notify(msg, 'warning');
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  // Google Maps URL Paste handler
  const handleMapsUrlChange = (val: string) => {
    setMapsUrlInput(val);
    setLocationError('');

    if (!val.trim()) {
      if (onChangeLocation) {
        onChangeLocation({
          latitude: null,
          longitude: null,
          accuracy: null,
          capturedAt: null,
          googleMapsUrl: '',
          locationMethod: 'google_maps_url'
        });
      }
      return;
    }

    const trimmed = val.trim();
    const parsedCoords = parseGoogleMapsCoordinates(trimmed);

    const newLocation: LocationDetails = {
      latitude: parsedCoords?.latitude ?? null,
      longitude: parsedCoords?.longitude ?? null,
      accuracy: null,
      capturedAt: new Date().toLocaleString('en-IN'),
      googleMapsUrl: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      locationMethod: 'google_maps_url'
    };

    if (onChangeLocation) onChangeLocation(newLocation);
  };

  const handleMethodSelect = (method: 'gps' | 'google_maps_url' | 'manual') => {
    setLocationMethod(method);
    setLocationError('');

    if (onChangeLocation) {
      onChangeLocation({
        latitude: method === 'gps' ? location?.latitude ?? null : location?.latitude ?? null,
        longitude: method === 'gps' ? location?.longitude ?? null : location?.longitude ?? null,
        accuracy: method === 'gps' ? location?.accuracy ?? null : null,
        capturedAt: location?.capturedAt || new Date().toLocaleString('en-IN'),
        googleMapsUrl: method === 'google_maps_url' ? mapsUrlInput : location?.googleMapsUrl || '',
        locationMethod: method
      });
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
        border: '1px solid var(--border-light, #e2e8f0)',
        borderRadius: 'var(--radius-md, 8px)',
        padding: '18px',
        opacity: disabled ? 0.65 : 1,
        pointerEvents: disabled ? 'none' : 'auto'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {title}
        </h4>
        {location?.latitude && location?.longitude && (
          <span className="badge badge-success" style={{ fontSize: '11px', gap: '4px' }}>
            <CheckCircle2 size={12} />
            <span>GPS Coordinates Saved</span>
          </span>
        )}
      </div>

      {/* Structured Fields Grid */}
      <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>Door / House Number</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. 12/A, Flat 302"
            value={address.houseNumber || ''}
            onChange={(e) => handleFieldChange('houseNumber', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>Street Name</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Gandhi Road, Main Street"
            value={address.street || ''}
            onChange={(e) => handleFieldChange('street', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>Area / Locality</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Near Bus Stand, Bazaar"
            value={address.locality || ''}
            onChange={(e) => handleFieldChange('locality', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>City</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Salem, Komarapalayam"
            value={address.city || ''}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>District</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Namakkal"
            value={address.district || ''}
            onChange={(e) => handleFieldChange('district', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>State</label>
          <input
            type="text"
            className="input-control"
            placeholder="e.g. Tamil Nadu"
            value={address.state || ''}
            onChange={(e) => handleFieldChange('state', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>Country</label>
          <input
            type="text"
            className="input-control"
            placeholder="India"
            value={address.country || 'India'}
            onChange={(e) => handleFieldChange('country', e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>

        <div className="form-group">
          <label className={`form-label ${isRequired ? 'required' : ''}`}>Pincode</label>
          <input
            type="text"
            className="input-control"
            maxLength={6}
            placeholder="e.g. 638183"
            value={address.pincode || ''}
            onChange={(e) => handleFieldChange('pincode', e.target.value.replace(/\D/g, ''))}
            required={isRequired}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Location Method Radio Options & Controls */}
      {onChangeLocation && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
          <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '8px' }}>
            LOCATION CAPTURE METHOD
          </label>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name={`${title.replace(/\s+/g, '')}_method`}
                checked={locationMethod === 'gps'}
                onChange={() => handleMethodSelect('gps')}
                disabled={disabled}
                style={{ accentColor: 'var(--color-primary-accent)' }}
              />
              <span>Capture GPS Location</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name={`${title.replace(/\s+/g, '')}_method`}
                checked={locationMethod === 'google_maps_url'}
                onChange={() => handleMethodSelect('google_maps_url')}
                disabled={disabled}
                style={{ accentColor: 'var(--color-primary-accent)' }}
              />
              <span>Paste Google Maps Location URL</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name={`${title.replace(/\s+/g, '')}_method`}
                checked={locationMethod === 'manual'}
                onChange={() => handleMethodSelect('manual')}
                disabled={disabled}
                style={{ accentColor: 'var(--color-primary-accent)' }}
              />
              <span>Manual Address Only</span>
            </label>
          </div>

          {/* Inline Location Error Banner */}
          {locationError && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#dc2626',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{locationError}</span>
            </div>
          )}

          {/* Option A: GPS Capture */}
          {locationMethod === 'gps' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCaptureGps}
                  disabled={isLocating || disabled}
                  style={{ gap: '6px', fontWeight: 600 }}
                >
                  {isLocating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} color="var(--color-primary-dark)" />}
                  <span>{isLocating ? 'Capturing GPS...' : `📍 Capture ${title} Location`}</span>
                </button>

                {location?.latitude && location?.longitude && (
                  <a
                    href={buildGoogleMapsUrl(location.latitude, location.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', gap: '6px', fontSize: '12px' }}
                  >
                    <ExternalLink size={13} />
                    <span>Open Location on Map</span>
                  </a>
                )}
              </div>

              {location?.latitude && location?.longitude && (
                <div
                  style={{
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-light, #cbd5e1)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    color: 'var(--text-dark)'
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Latitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{location.latitude}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Longitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{location.longitude}</strong>
                  </div>
                  {location.accuracy && (
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Accuracy</span>
                      <strong style={{ color: '#059669' }}>±{location.accuracy} meters</strong>
                    </div>
                  )}
                  {location.capturedAt && (
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Captured At</span>
                      <span style={{ fontSize: '11.5px' }}>{location.capturedAt}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Option B: Google Maps Location URL */}
          {locationMethod === 'google_maps_url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  className="input-control"
                  placeholder="e.g. https://maps.google.com/?q=11.6643,78.1460"
                  value={mapsUrlInput}
                  onChange={(e) => handleMapsUrlChange(e.target.value)}
                  disabled={disabled}
                  style={{ flex: 1 }}
                />
                {mapsUrlInput.trim() && (
                  <a
                    href={mapsUrlInput.startsWith('http') ? mapsUrlInput : `https://${mapsUrlInput}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                  >
                    <ExternalLink size={13} />
                    <span>View Location</span>
                  </a>
                )}
              </div>

              {location?.latitude && location?.longitude && (
                <small style={{ color: '#059669', fontSize: '11.5px', fontWeight: 600 }}>
                  ✓ Extracted coordinates: Lat {location.latitude}, Lng {location.longitude}
                </small>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
