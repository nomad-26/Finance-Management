import React, { useState, useEffect } from 'react';
import { User, Save, X } from 'lucide-react';
import { Customer, StructuredAddress, LocationDetails } from '../../types';
import {
  validatePhone,
  validateIDProof,
  formatPhoneInput,
  parseCustomerKYC
} from '../../utils/kycValidation';
import { IDProofInputFields } from './IDProofInputFields';
import { CustomerPhotoUpload } from './CustomerPhotoUpload';
import { StructuredAddressInput } from './StructuredAddressInput';
import { emptyStructuredAddress, formatStructuredAddress } from '../../utils/addressUtils';

export interface EditCustomerModalProps {
  isOpen: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Customer>) => void;
}

export const EditCustomerModal: React.FC<EditCustomerModalProps> = ({
  isOpen,
  customer,
  onClose,
  onSave
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [age, setAge] = useState<number>(30);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');
  const [email, setEmail] = useState('');
  const [idProof, setIdProof] = useState('Aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [extraPan, setExtraPan] = useState('');
  const [docName, setDocName] = useState('');
  const [idProofValid, setIdProofValid] = useState(false);

  // Photo
  const [customerPhoto, setCustomerPhoto] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<'upload' | 'webcam' | null>(null);

  // Structured Address & Location
  const [currentAddressObj, setCurrentAddressObj] = useState<StructuredAddress>(emptyStructuredAddress);
  const [permanentAddressObj, setPermanentAddressObj] = useState<StructuredAddress>(emptyStructuredAddress);
  const [currentLoc, setCurrentLoc] = useState<LocationDetails | null>(null);
  const [permanentLoc, setPermanentLoc] = useState<LocationDetails | null>(null);
  const [sameAddress, setSameAddress] = useState(true);

  const [status, setStatus] = useState<'VERIFIED' | 'PENDING'>('VERIFIED');

  useEffect(() => {
    if (customer && isOpen) {
      setName(customer.name || '');
      const cleanP = formatPhoneInput(customer.phone || '');
      setPhone(cleanP);
      setPhoneError('');
      setPhoneTouched(false);

      setGender(customer.gender || 'Male');
      setAge(customer.age || 30);
      setDateOfBirth(customer.dateOfBirth || '');
      setOccupation(customer.occupation || '');
      setEmail(customer.email || '');

      setCustomerPhoto(customer.customerPhoto || null);
      setPhotoSource(customer.photoSource || null);

      const parsedKYC = parseCustomerKYC(customer);
      setIdProof(parsedKYC.idProof);
      setIdNumber(parsedKYC.idNumber);
      setExtraPan(parsedKYC.extraPan);
      setDocName(parsedKYC.docName);

      // Validate loaded KYC data immediately
      const idVal = validateIDProof(parsedKYC.idProof, parsedKYC.idNumber, parsedKYC.extraPan, parsedKYC.docName);
      setIdProofValid(idVal.isValid);

      // Addresses
      if (customer.currentAddressDetails) {
        setCurrentAddressObj(customer.currentAddressDetails);
      } else {
        setCurrentAddressObj({ ...emptyStructuredAddress, street: customer.currentAddress || '' });
      }

      if (customer.permanentAddressDetails) {
        setPermanentAddressObj(customer.permanentAddressDetails);
      } else {
        setPermanentAddressObj({ ...emptyStructuredAddress, street: customer.permanentAddress || '' });
      }

      setCurrentLoc(customer.currentLocation as LocationDetails || null);
      setPermanentLoc(customer.permanentLocation as LocationDetails || null);

      setSameAddress(customer.currentAddress === customer.permanentAddress || !customer.permanentAddress);
      setStatus(customer.status || 'VERIFIED');
    }
  }, [customer, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !customer) return null;

  const handlePhoneChange = (val: string) => {
    const formatted = formatPhoneInput(val);
    setPhone(formatted);
    setPhoneTouched(true);
    const res = validatePhone(formatted);
    setPhoneError(res.isValid ? '' : (res.error || ''));
  };

  const handleIdProofChange = (payload: {
    idProof: string;
    idNumber: string;
    extraPan?: string;
    docName?: string;
    isValid: boolean;
    error?: string;
    structured?: any;
  }) => {
    setIdProof(payload.idProof);
    setIdNumber(payload.idNumber);
    setExtraPan(payload.extraPan || '');
    setDocName(payload.docName || '');
    setIdProofValid(payload.isValid);
  };

  const handlePhotoChange = (_file: File | null, dataUrl: string | null) => {
    setCustomerPhoto(dataUrl);
    setPhotoSource(dataUrl ? (dataUrl.startsWith('data:image') ? 'upload' : 'webcam') : null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    setPhoneTouched(true);

    const phoneRes = validatePhone(phone);
    const idRes = validateIDProof(idProof, idNumber, extraPan, docName);

    setPhoneError(phoneRes.isValid ? '' : (phoneRes.error || ''));

    const formattedCurr = formatStructuredAddress(currentAddressObj);
    const formattedPerm = sameAddress ? formattedCurr : formatStructuredAddress(permanentAddressObj);

    if (!name.trim() || (!formattedCurr.trim() && !currentAddressObj.street.trim()) || !phoneRes.isValid || !idRes.isValid) {
      return;
    }

    const proofLower = idProof.toLowerCase();
    const isAadhaarPan = proofLower.includes('aadhaar + pan') || (proofLower.includes('aadhaar') && proofLower.includes('pan'));
    const isAadhaarSingle = proofLower === 'aadhaar';
    const isPanSingle = proofLower === 'pan';
    const isOther = proofLower.includes('other');

    const cleanAadhaar = isAadhaarPan || isAadhaarSingle ? idNumber.replace(/\D/g, '') : undefined;
    const cleanPan = isAadhaarPan ? extraPan.toUpperCase().trim() : (isPanSingle ? idNumber.toUpperCase().trim() : undefined);

    onSave(customer.id, {
      name: name.trim(),
      phone: phoneRes.normalizedValue || phone.trim(),
      gender,
      age: Number(age) || undefined,
      dateOfBirth: dateOfBirth || undefined,
      occupation: occupation.trim() || 'Self Employed',
      email: email.trim() || undefined,
      customerPhoto,
      photoSource,
      idProof,
      idNumber: idRes.formattedValue || idNumber.trim(),
      aadhaarNumber: cleanAadhaar,
      panNumber: cleanPan,
      extraPan: isAadhaarPan ? cleanPan : undefined,
      otherIdName: isOther ? docName.trim() : undefined,
      docName: isOther ? docName.trim() : undefined,
      currentAddressDetails: currentAddressObj,
      permanentAddressDetails: sameAddress ? currentAddressObj : permanentAddressObj,
      currentAddress: formattedCurr || customer.currentAddress,
      permanentAddress: formattedPerm || customer.permanentAddress,
      currentLocation: currentLoc,
      permanentLocation: sameAddress ? currentLoc : permanentLoc,
      status
    });

    onClose();
  };

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
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          height: 'auto',
          boxShadow: 'var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.2))',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border-light, #e2e8f0)',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Fixed Modal Header */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(201, 162, 39, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary-dark)',
                fontWeight: 700
              }}
            >
              <User size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                Edit Borrower KYC Profile
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Customer ID: <strong style={{ color: 'var(--color-primary-dark)' }}>{customer.id}</strong>
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
              padding: '4px',
              borderRadius: '50%'
            }}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
            {/* Customer Photo Upload Section */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <CustomerPhotoUpload
                photoUrl={customerPhoto}
                onChange={handlePhotoChange}
              />
            </div>

            <div className="grid-2" style={{ gap: '14px' }}>
              <div className="form-group">
                <label className="form-label required">Customer Full Name</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Phone Number</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      padding: '0 10px',
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      background: 'var(--bg-surface-secondary, #f1f5f9)',
                      border: '1px solid var(--border-light, #cbd5e1)',
                      borderRadius: 'var(--radius-md, 6px)',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    +91
                  </span>
                  <input
                    type="text"
                    className="input-control"
                    style={{
                      flex: 1,
                      borderColor: phoneTouched && phoneError ? 'var(--color-danger, #ef4444)' : undefined
                    }}
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onBlur={() => {
                      setPhoneTouched(true);
                      const res = validatePhone(phone);
                      setPhoneError(res.isValid ? '' : (res.error || ''));
                    }}
                  />
                </div>
                {phoneTouched && phoneError && (
                  <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                    {phoneError}
                  </small>
                )}
              </div>
            </div>

            <div className="grid-3" style={{ gap: '14px' }}>
              <div className="form-group">
                <label className="form-label required">Gender</label>
                <select
                  className="select-control"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Age</label>
                <input
                  type="number"
                  className="input-control"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Occupation</label>
                <input
                  type="text"
                  className="input-control"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                />
              </div>
            </div>

            <div className="grid-2" style={{ gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="input-control"
                  placeholder="customer@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label required">KYC Status</label>
                <select
                  className="select-control"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                >
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="PENDING">PENDING KYC</option>
                </select>
              </div>
            </div>

            {/* Dynamic ID Proof Fields System */}
            <IDProofInputFields
              idProof={idProof}
              idNumber={idNumber}
              extraPan={extraPan}
              docName={docName}
              onChange={handleIdProofChange}
            />

            {/* Current Address */}
            <StructuredAddressInput
              title="Current Address"
              address={currentAddressObj}
              onChangeAddress={setCurrentAddressObj}
              location={currentLoc}
              onChangeLocation={setCurrentLoc}
              isRequired={true}
            />

            {/* Same as current address checkbox */}
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-dark)' }}>
                <input
                  type="checkbox"
                  checked={sameAddress}
                  onChange={(e) => setSameAddress(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary-accent)', width: '16px', height: '16px' }}
                />
                <span>Permanent address same as current address</span>
              </label>
            </div>

            {/* Permanent Address */}
            {!sameAddress && (
              <StructuredAddressInput
                title="Permanent Address"
                address={permanentAddressObj}
                onChangeAddress={setPermanentAddressObj}
                location={permanentLoc}
                onChangeLocation={setPermanentLoc}
                isRequired={true}
              />
            )}
          </div>

          {/* Fixed Modal Footer */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-subtle, #f1f5f9)',
              backgroundColor: 'var(--bg-surface-secondary, #f8fafc)'
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ height: '38px', padding: '0 16px' }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!!phoneError || !idProofValid}
              style={{ height: '38px', gap: '8px', padding: '0 20px', opacity: (phoneError || !idProofValid) ? 0.65 : 1 }}
            >
              <Save size={16} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
