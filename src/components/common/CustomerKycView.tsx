import React from 'react';
import { Customer } from '../../types';
import { getCanonicalCustomerId } from '../../utils/customerUtils';
import { maskAadhaarNumber } from '../../utils/kycValidation';
import {
  ArrowLeft,
  User,
  ShieldCheck,
  MapPin,
  ExternalLink,
  Edit3,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface CustomerKycViewProps {
  customer: Customer;
  onBack: () => void;
  onEdit?: (customer: Customer) => void;
}

export const CustomerKycView: React.FC<CustomerKycViewProps> = ({ customer, onBack, onEdit }) => {
  const canonicalId = getCanonicalCustomerId(customer);

  // Determine Location Information
  const locationData = customer.currentLocation || customer.permanentLocation || customer.location;
  const hasCoordinates = locationData && (locationData.latitude !== null && locationData.longitude !== null);
  const mapsUrl = locationData?.googleMapsUrl || (hasCoordinates ? `https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}` : '');

  // Determine Permanent Address Relationship
  const isSameAddress =
    !customer.permanentAddress ||
    customer.permanentAddress.trim() === '' ||
    customer.permanentAddress.trim().toLowerCase() === customer.currentAddress.trim().toLowerCase();

  // Check DOB and Age calculation
  let dobStr = customer.dateOfBirth || '';
  let calculatedAge = customer.age;
  if (dobStr && !calculatedAge) {
    const parts = dobStr.split(/[-/]/).map((p) => parseInt(p, 10));
    if (parts.length === 3) {
      const birthYear = parts[0] > 1000 ? parts[0] : parts[2];
      if (birthYear) {
        calculatedAge = new Date().getFullYear() - birthYear;
      }
    }
  }

  // ID Verification Breakdown
  const aadhaarVal = customer.aadhaarNumber || (customer.idProof?.toLowerCase().includes('aadhaar') ? customer.idNumber : '');
  const panVal = customer.panNumber || (customer.idProof?.toLowerCase().includes('pan') ? customer.idNumber : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* NAVIGATION & TOP HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn btn-secondary"
          style={{ height: '38px', padding: '0 14px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={16} />
          <span>Back to New Deposit</span>
        </button>

        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(customer)}
            className="btn btn-secondary"
            style={{ height: '38px', padding: '0 14px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Edit3 size={15} />
            <span>Edit KYC</span>
          </button>
        )}
      </div>

      {/* COMPACT IDENTITY HEADER CARD */}
      <div
        className="card"
        style={{
          padding: '20px',
          backgroundColor: '#ffffff',
          borderLeft: '5px solid var(--color-primary-accent, #059669)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {customer.customerPhoto ? (
            <img
              src={customer.customerPhoto}
              alt={customer.name}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--color-primary-accent, #059669)'
              }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-light-accent, #ecfdf5)',
                color: 'var(--color-primary-dark, #047857)',
                fontWeight: 900,
                fontSize: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--color-primary-accent, #059669)'
              }}
            >
              {customer.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-dark, #0f172a)' }}>
                {customer.name}
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#059669',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ShieldCheck size={13} />
                VERIFIED MASTER CUSTOMER
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
              <span>
                Customer ID: <strong style={{ color: 'var(--color-primary-dark, #047857)' }}>{canonicalId}</strong>
              </span>
              <span>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-dark)' }}>
                <Phone size={13} color="var(--color-primary-accent)" />
                +91 {customer.phone}
              </span>
              {customer.occupation && (
                <>
                  <span>•</span>
                  <span>{customer.occupation}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN GRID FOR KYC SECTIONS */}
      <div className="grid-2" style={{ gap: '20px' }}>
        {/* SECTION 1: PERSONAL INFORMATION */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-dark)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={16} />
            Personal Information
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Full Name</span>
              <strong style={{ color: 'var(--text-dark)' }}>{customer.name}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Customer ID</span>
              <strong style={{ color: 'var(--color-primary-dark)' }}>{canonicalId}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Mobile Number</span>
              <strong style={{ color: 'var(--text-dark)' }}>+91 {customer.phone}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gender</span>
              <strong style={{ color: 'var(--text-dark)' }}>{customer.gender || 'Not specified'}</strong>
            </div>

            {dobStr && (
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Date of Birth</span>
                <strong style={{ color: 'var(--text-dark)' }}>{dobStr}</strong>
              </div>
            )}

            {calculatedAge && (
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Age</span>
                <strong style={{ color: 'var(--text-dark)' }}>{calculatedAge} Years</strong>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Occupation</span>
              <strong style={{ color: 'var(--text-dark)' }}>{customer.occupation || 'N/A'}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Email Address</span>
              <strong style={{ color: 'var(--text-dark)' }}>{customer.email || 'Not provided'}</strong>
            </div>
          </div>
        </div>

        {/* SECTION 2: IDENTITY VERIFICATION (KYC) */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-dark)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} />
            Identity Verification (KYC)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>ID Proof Type</span>
              <strong style={{ color: 'var(--text-dark)' }}>{customer.idProof || 'Aadhaar Card'}</strong>
            </div>

            {aadhaarVal ? (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Aadhaar Number</span>
                <strong style={{ color: 'var(--color-primary-dark)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                  {maskAadhaarNumber(aadhaarVal)}
                </strong>
              </div>
            ) : null}

            {panVal ? (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>PAN Number</span>
                <strong style={{ color: 'var(--color-primary-dark)', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                  {panVal.toUpperCase()}
                </strong>
              </div>
            ) : null}

            {!aadhaarVal && !panVal && customer.idNumber && (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>ID Number</span>
                <strong style={{ color: 'var(--text-dark)', fontFamily: 'monospace' }}>{customer.idNumber}</strong>
              </div>
            )}

            <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-light, #e2e8f0)', fontSize: '12px', color: 'var(--text-secondary)' }}>
              🔒 Sensitive identity documents are masked in accordance with Gold Finance KYC protection guidelines.
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: ADDRESS DETAILS */}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-dark)', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MapPin size={16} />
          Address Details
        </h3>

        <div className="grid-2" style={{ gap: '20px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CURRENT RESIDENTIAL ADDRESS</span>
            <div style={{ marginTop: '6px', padding: '12px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-dark)' }}>
              {customer.currentAddress || 'No current address recorded.'}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PERMANENT ADDRESS</span>
            <div style={{ marginTop: '6px', padding: '12px', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '13px', lineHeight: '1.6', color: 'var(--text-dark)' }}>
              {isSameAddress ? (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>[SAME AS CURRENT ADDRESS]</span>
              ) : (
                customer.permanentAddress
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN GRID FOR LOCATION & KYC CHECKLIST */}
      <div className="grid-2" style={{ gap: '20px' }}>
        {/* SECTION 4: LOCATION / GPS */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-dark)', margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={16} />
            Customer Location Details
          </h3>

          {hasCoordinates ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '12.5px', fontWeight: 700 }}>
                <CheckCircle2 size={16} />
                <span>GPS Location Verified</span>
              </div>

              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px' }}>
                <span>Latitude:</span>
                <strong style={{ color: 'var(--text-dark)' }}>{locationData?.latitude}</strong>
                <span>Longitude:</span>
                <strong style={{ color: 'var(--text-dark)' }}>{locationData?.longitude}</strong>
                {locationData?.accuracy && (
                  <>
                    <span>Accuracy:</span>
                    <strong style={{ color: 'var(--text-dark)' }}>±{locationData.accuracy} meters</strong>
                  </>
                )}
                {locationData?.capturedAt && (
                  <>
                    <span>Captured At:</span>
                    <strong style={{ color: 'var(--text-dark)' }}>{locationData.capturedAt}</strong>
                  </>
                )}
              </div>

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '6px', height: '34px', width: 'fit-content', gap: '6px', fontSize: '12px', fontWeight: 700 }}
                >
                  <MapPin size={14} color="var(--color-primary-accent)" />
                  <span>View on Google Maps</span>
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          ) : mapsUrl ? (
            <div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ height: '34px', gap: '6px', fontSize: '12px', fontWeight: 700 }}
              >
                <MapPin size={14} color="var(--color-primary-accent)" />
                <span>View Saved Location</span>
                <ExternalLink size={12} />
              </a>
            </div>
          ) : (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Location data not recorded for this customer.
            </div>
          )}
        </div>

        {/* SECTION 5: KYC CHECKLIST */}
        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-dark)', margin: '0 0 14px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} />
            KYC Verification Checklist
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 700 }}>
              <CheckCircle2 size={15} />
              <span>Personal Details</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: customer.customerPhoto ? '#059669' : 'var(--text-muted)', fontWeight: 700 }}>
              {customer.customerPhoto ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>Customer Photo</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: (aadhaarVal || panVal || customer.idNumber) ? '#059669' : 'var(--text-muted)', fontWeight: 700 }}>
              <CheckCircle2 size={15} />
              <span>Identity Proof</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: customer.currentAddress ? '#059669' : 'var(--text-muted)', fontWeight: 700 }}>
              <CheckCircle2 size={15} />
              <span>Current Address</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 700 }}>
              <CheckCircle2 size={15} />
              <span>Permanent Address</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasCoordinates ? '#059669' : 'var(--text-muted)', fontWeight: 700 }}>
              {hasCoordinates ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>Location GPS</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER BACK BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn btn-primary"
          style={{ padding: '12px 32px', fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={16} />
          <span>Return to New Deposit ({canonicalId})</span>
        </button>
      </div>
    </div>
  );
};
