import React, { useState } from 'react';
import { Customer, Loan } from '../../types';
import { X, User, ShieldCheck, ExternalLink, Phone, Mail, Briefcase, Calendar, CheckCircle2, FileSpreadsheet, Users, AlertCircle, FileText, Image, Edit3, Trash2 } from 'lucide-react';
import { formatIdProofDisplay } from '../../utils/kycValidation';
import { buildGoogleMapsUrl } from '../../utils/addressUtils';
import { useApp } from '../../context/AppContext';
import { isMatchingCustomerId, getCanonicalCustomerId } from '../../utils/customerUtils';
import { toDisplayDate } from './AgeDobInput';
import { apiService } from '../../services/api';
import { isAdminRole } from '../../config/permissions';
import { EditLoanModal } from '../admin/EditLoanModal';
import { DeleteLoanModal } from '../admin/DeleteLoanModal';

export interface ViewCustomerModalProps {
  isOpen: boolean;
  customer: Customer | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
}

export const ViewCustomerModal: React.FC<ViewCustomerModalProps> = ({
  isOpen,
  customer,
  isLoading = false,
  errorMessage = null,
  onClose,
  onEdit
}) => {
  const { loans, showToast, userRole } = useApp();
  const isAdmin = isAdminRole(userRole);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const handleViewKycDoc = async (doc: any) => {
    if (!doc) return;
    const docId = doc.fileId || doc.publicId || doc.id || doc.storagePath || 'doc';
    try {
      setViewingDocId(docId);
      const res = await apiService.viewProtectedDocument(doc);
      if (!res.success) {
        if (showToast) {
          showToast(res.message || 'Unable to open KYC document. Please check permissions.', 'error');
        } else {
          alert(res.message || 'Unable to open KYC document. Please check permissions.');
        }
      }
    } catch (err: any) {
      if (showToast) {
        showToast(err.message || 'Error opening KYC document.', 'error');
      } else {
        alert(err.message || 'Error opening KYC document.');
      }
    } finally {
      setViewingDocId(null);
    }
  };

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}
        onClick={onClose}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '480px',
            padding: '36px',
            textAlign: 'center',
            borderRadius: 'var(--radius-lg, 12px)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700 }}>Loading customer details...</h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>Please wait while customer records are retrieved.</p>
        </div>
      </div>
    );
  }

  if (errorMessage || !customer) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}
        onClick={onClose}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '480px',
            padding: '36px',
            textAlign: 'center',
            borderRadius: 'var(--radius-lg, 12px)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle size={44} color="var(--color-danger, #ef4444)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 800 }}>
            {errorMessage || 'Customer not found.'}
          </h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Unable to load customer details. Please check the customer ID and try again.
          </p>
          <button className="btn btn-secondary" onClick={onClose} style={{ margin: '0 auto' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const canonicalId = getCanonicalCustomerId(customer);
  const currentLoc = customer.currentLocation;
  const permLoc = customer.permanentLocation;
  const isSameAddress =
    customer.currentAddress === customer.permanentAddress ||
    (!customer.permanentAddress && !customer.permanentAddressDetails);

  const currentMapsUrl =
    currentLoc?.googleMapsUrl ||
    (currentLoc?.latitude && currentLoc?.longitude
      ? buildGoogleMapsUrl(currentLoc.latitude, currentLoc.longitude)
      : '');

  const permMapsUrl =
    permLoc?.googleMapsUrl ||
    (permLoc?.latitude && permLoc?.longitude
      ? buildGoogleMapsUrl(permLoc.latitude, permLoc.longitude)
      : '');

  // Retrieve customer's actual loans from context/database
  const customerLoans: Loan[] = (loans || []).filter((l) => isMatchingCustomerId(l.customerId, customer));
  const activeLoans = customerLoans.filter((l) => l.status !== 'CLOSED' && (l.outstandingPrincipal ?? l.principal) > 0);
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.outstandingPrincipal ?? l.principal ?? 0), 0);

  const nominee = customer.nominee;
  const hasNomineeData = nominee && (nominee.hasNominee || nominee.name || nominee.fullName);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '740px',
          maxHeight: '90vh',
          height: 'auto',
          boxShadow: 'var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.2))',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div
          style={{
            flexShrink: 0,
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {customer.customerPhoto ? (
              <img
                src={customer.customerPhoto}
                alt={customer.name}
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--color-primary-accent, #059669)',
                  flexShrink: 0
                }}
              />
            ) : (
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-light-accent, #e6f4f1)',
                  color: 'var(--color-primary-dark, #163f35)',
                  fontWeight: 800,
                  fontSize: '17px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {customer.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  {customer.name}
                </h3>
                <span className={`badge ${customer.status === 'VERIFIED' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                  <ShieldCheck size={12} style={{ marginRight: '4px' }} />
                  {customer.status || 'VERIFIED'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                Customer ID: <strong style={{ color: 'var(--color-primary-dark)' }}>{canonicalId || customer.id}</strong> | Registered: {customer.joinedDate || customer.createdAt || 'N/A'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '6px',
              borderRadius: '50%'
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div
          className="modal-body-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '24px',
            paddingBottom: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* PROFILE PHOTO & KYC STATUS */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}
          >
            <div
              style={{
                width: '90px',
                height: '105px',
                borderRadius: '8px',
                border: '2px solid var(--color-primary-accent, #059669)',
                overflow: 'hidden',
                flexShrink: 0,
                backgroundColor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {customer.customerPhoto ? (
                <img
                  src={customer.customerPhoto}
                  alt="KYC Profile Photo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <User size={38} color="var(--text-muted)" />
              )}
            </div>

            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 700, color: 'var(--text-dark)' }}>
                KYC PROFILE PHOTO
              </h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Source: <strong style={{ textTransform: 'capitalize' }}>{customer.photoSource || (customer.customerPhoto ? 'Uploaded' : 'Default Avatar')}</strong>
              </p>
              {customer.customerPhoto ? (
                <span className="badge badge-success" style={{ fontSize: '11px' }}>
                  ✓ Profile Photo Verified
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '11px' }}>
                  No Custom Photo Attached
                </span>
              )}
            </div>
          </div>

          {/* PERSONAL INFORMATION */}
          <div>
            <h4
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: 'var(--color-primary-dark)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                margin: '0 0 12px 0',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '6px'
              }}
            >
              PERSONAL INFORMATION
            </h4>

            <div className="grid-3" style={{ gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>PHONE NUMBER</span>
                <strong style={{ color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Phone size={13} color="var(--color-primary-accent)" />
                  +91 {customer.phone}
                </strong>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>GENDER / AGE</span>
                <strong style={{ color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>
                  {customer.gender} {customer.age ? `(${customer.age} yrs)` : ''}
                </strong>
              </div>

              {customer.dateOfBirth && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>DATE OF BIRTH</span>
                  <strong style={{ color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <Calendar size={13} color="var(--color-primary-accent)" />
                    {toDisplayDate(customer.dateOfBirth)}
                  </strong>
                </div>
              )}

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>OCCUPATION</span>
                <strong style={{ color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Briefcase size={13} color="var(--color-primary-accent)" />
                  {customer.occupation || 'Self Employed'}
                </strong>
              </div>

              {customer.email && (
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>EMAIL</span>
                  <strong style={{ color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <Mail size={13} color="var(--color-primary-accent)" />
                    {customer.email}
                  </strong>
                </div>
              )}

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>ID PROOF</span>
                <div style={{ marginTop: '2px' }}>
                  <strong style={{ color: 'var(--color-primary-dark)' }}>{customer.idProof}: </strong>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatIdProofDisplay(customer.idProof, customer.idNumber)}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>EXISTING LOANS</span>
                <span className="badge badge-info" style={{ marginTop: '2px', display: 'inline-block' }}>
                  {customerLoans.length} Total ({activeLoans.length} Active)
                </span>
              </div>
            </div>
          </div>

          {/* NOMINEE DETAILS (IF PRESENT) */}
          {hasNomineeData && (
            <div>
              <h4
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: 'var(--color-primary-dark)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0 0 12px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Users size={14} color="var(--color-primary-accent)" />
                <span>NOMINEE DETAILS</span>
              </h4>

              <div className="grid-3" style={{ gap: '14px', fontSize: '13px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>NOMINEE NAME</span>
                  <strong style={{ color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>
                    {nominee.name || nominee.fullName || '—'}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>RELATIONSHIP</span>
                  <strong style={{ color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>
                    {nominee.relationship || nominee.relation || nominee.customRelation || '—'}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>PHONE NUMBER</span>
                  <strong style={{ color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>
                    {nominee.phone ? `+91 ${nominee.phone}` : '—'}
                  </strong>
                </div>

                {nominee.address && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>NOMINEE ADDRESS</span>
                    <span style={{ color: 'var(--text-dark)', marginTop: '2px', display: 'block' }}>
                      {nominee.address}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CURRENT ADDRESS */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase' }}>
                CURRENT ADDRESS
              </h4>
              {currentLoc?.latitude && currentLoc?.longitude && (
                <span className="badge badge-success" style={{ fontSize: '11px', gap: '4px' }}>
                  <CheckCircle2 size={12} />
                  <span>GPS Location Verified</span>
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-dark)', fontWeight: 600, lineHeight: '1.5' }}>
              {customer.currentAddress}
            </p>

            {/* GPS details if present */}
            {currentLoc?.latitude && currentLoc?.longitude ? (
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div style={{ fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Latitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{currentLoc.latitude}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Longitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{currentLoc.longitude}</strong>
                  </div>
                  {currentLoc.accuracy && (
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Accuracy</span>
                      <strong style={{ color: '#059669' }}>±{currentLoc.accuracy}m</strong>
                    </div>
                  )}
                </div>

                {currentMapsUrl && (
                  <a
                    href={currentMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none', gap: '6px', fontSize: '12px' }}
                  >
                    <ExternalLink size={13} />
                    <span>View on Google Maps</span>
                  </a>
                )}
              </div>
            ) : currentMapsUrl ? (
              <a
                href={currentMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: 'none', gap: '6px', fontSize: '12px', display: 'inline-flex' }}
              >
                <ExternalLink size={13} />
                <span>View Google Maps Link</span>
              </a>
            ) : null}
          </div>

          {/* PERMANENT ADDRESS */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--color-primary-dark)', textTransform: 'uppercase' }}>
                PERMANENT ADDRESS
              </h4>
              {isSameAddress && (
                <span className="badge badge-info" style={{ fontSize: '11px' }}>
                  Same as Current Address
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-dark)', fontWeight: 600, lineHeight: '1.5' }}>
              {isSameAddress ? customer.currentAddress : (customer.permanentAddress || customer.currentAddress)}
            </p>

            {/* Permanent GPS details if separate */}
            {!isSameAddress && permLoc?.latitude && permLoc?.longitude && (
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div style={{ fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Latitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{permLoc.latitude}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block' }}>Longitude</span>
                    <strong style={{ fontFamily: 'monospace' }}>{permLoc.longitude}</strong>
                  </div>
                </div>

                {permMapsUrl && (
                  <a
                    href={permMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', gap: '6px', fontSize: '12px' }}
                  >
                    <ExternalLink size={13} />
                    <span>View Permanent Location on Maps</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ATTACHED KYC DOCUMENTS (GOOGLE DRIVE) */}
          {customer.kycDocuments && customer.kycDocuments.length > 0 && (
            <div>
              <h4
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: 'var(--color-primary-dark)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: '0 0 10px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileText size={14} color="var(--color-primary-accent)" />
                <span>ATTACHED KYC DOCUMENTS ({customer.kycDocuments.length})</span>
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                {customer.kycDocuments.map((doc, idx) => {
                  const isPdf = doc.resourceType === 'raw' || doc.mimeType?.includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf') || doc.url?.endsWith('.pdf');
                  const docIdKey = doc.fileId || doc.publicId || doc.id || `kyc-${idx}`;
                  const isViewingThis = viewingDocId === docIdKey;

                  return (
                    <button
                      type="button"
                      key={`kyc-doc-${docIdKey}`}
                      onClick={() => handleViewKycDoc(doc)}
                      disabled={isViewingThis}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                        border: '1px solid var(--border-light, #cbd5e1)',
                        borderRadius: '8px',
                        textAlign: 'left',
                        cursor: isViewingThis ? 'wait' : 'pointer',
                        color: 'inherit',
                        transition: 'border-color 0.2s',
                        width: '100%',
                        opacity: isViewingThis ? 0.7 : 1
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          backgroundColor: isPdf ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                          color: isPdf ? 'var(--color-danger, #ef4444)' : 'var(--color-primary, #3b82f6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {isPdf ? <FileText size={18} /> : <Image size={18} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.documentName || doc.fileName || `${doc.documentType || 'KYC'} Doc`}
                        </p>
                        <span style={{ fontSize: '11px', color: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>{isViewingThis ? 'Opening document...' : 'Open in Google Drive'}</span>
                          <ExternalLink size={10} />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          )}

          {/* ═══════════════════════════════════════════════════════════════════
              EXISTING LOANS SECTION (REAL DATABASE RECORDS)
              ═══════════════════════════════════════════════════════════════════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px', marginBottom: '12px' }}>
              <h4
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: 'var(--color-primary-dark)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileSpreadsheet size={14} color="var(--color-primary-accent)" />
                <span>EXISTING LOANS &amp; FINANCIAL HISTORY ({customerLoans.length})</span>
              </h4>
              <span className="badge badge-success" style={{ fontSize: '11px' }}>
                ₹{totalOutstanding.toLocaleString('en-IN')} Outstanding
              </span>
            </div>

            {customerLoans.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-light)',
                  color: 'var(--text-muted)',
                  fontSize: '13px'
                }}
              >
                No active or past loans found for this customer.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {customerLoans.map((loan, lIdx) => {
                  const outstanding = loan.outstandingPrincipal ?? loan.principal ?? 0;
                  const isClosed = loan.status === 'CLOSED';
                  return (
                    <div
                      key={`cust-loan-${loan.id || loan.loanNo}-${lIdx}`}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        backgroundColor: isClosed ? 'var(--bg-surface-secondary, #f8fafc)' : 'var(--bg-card, #ffffff)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '13.5px', color: 'var(--color-primary-dark)' }}>{loan.loanNo}</strong>
                            <span className={`badge ${isClosed ? 'badge-secondary' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                              {loan.status}
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {loan.loanTypeName || loan.loanType} &bull; Issued: {loan.date}
                            {loan.items && loan.items.length > 0 && ` &bull; ${loan.items.length} Item(s)`}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-dark)' }}>
                          Principal: ₹{loan.principal.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Outstanding: <strong style={{ color: outstanding > 0 ? 'var(--color-danger, #ef4444)' : 'var(--badge-success-text)' }}>₹{outstanding.toLocaleString('en-IN')}</strong> @ {loan.interestRate || loan.interestRateSnapshot || 1.5}%/mo
                        </div>
                        {isAdmin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '11px', padding: '2px 8px', gap: '4px', height: '26px' }}
                              onClick={() => setEditingLoan(loan)}
                              title="Admin Edit Loan"
                            >
                              <Edit3 size={12} />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                gap: '4px',
                                height: '26px',
                                color: 'var(--color-danger, #ef4444)'
                              }}
                              onClick={() => setDeletingLoan(loan)}
                              title="Admin Delete Loan"
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Footer Actions */}
        <div
          style={{
            flexShrink: 0,
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle, #f1f5f9)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
          }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {onEdit && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onEdit(customer);
              }}
            >
              Edit Customer Profile
            </button>
          )}
        </div>
      </div>

      {/* Admin Edit & Delete Loan Modals */}
      {isAdmin && (
        <>
          <EditLoanModal
            isOpen={!!editingLoan}
            loan={editingLoan}
            onClose={() => setEditingLoan(null)}
            onSuccess={() => setEditingLoan(null)}
          />
          <DeleteLoanModal
            isOpen={!!deletingLoan}
            loan={deletingLoan}
            onClose={() => setDeletingLoan(null)}
            onSuccess={() => setDeletingLoan(null)}
          />
        </>
      )}
    </div>
  );
};

