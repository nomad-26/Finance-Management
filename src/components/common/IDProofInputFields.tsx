import React, { useState } from 'react';
import {
  formatAadhaarInput,
  validateAadhaarNumber,
  validatePANNumber,
  validateVoterId,
  validateDrivingLicence,
  validatePassport,
  validateOtherDocument,
  StructuredIDProof
} from '../../utils/kycValidation';

export interface IDProofValues {
  idProof: string;
  idNumber: string;
  extraPan?: string;
  docName?: string;
}

export interface IDProofChangePayload extends IDProofValues {
  isValid: boolean;
  error?: string;
  structured?: StructuredIDProof;
}

export interface IDProofInputFieldsProps {
  idProof: string;
  idNumber: string;
  extraPan?: string;
  docName?: string;
  onChange: (payload: IDProofChangePayload) => void;
  disabled?: boolean;
}

export const ID_PROOF_OPTIONS = [
  'Aadhaar',
  'PAN',
  'Aadhaar + PAN',
  'Voter ID',
  'Driving Licence',
  'Passport',
  'Other'
];

export const IDProofInputFields: React.FC<IDProofInputFieldsProps> = ({
  idProof,
  idNumber,
  extraPan = '',
  docName = '',
  onChange,
  disabled = false
}) => {
  const [touchedMain, setTouchedMain] = useState(false);
  const [touchedPan, setTouchedPan] = useState(false);
  const [touchedDocName, setTouchedDocName] = useState(false);

  // Normalize initial idProof matching
  const currentType = (idProof || 'Aadhaar').trim();

  // Helper validation evaluation
  const evaluateValidation = (
    type: string,
    mainVal: string,
    panVal: string,
    nameVal: string
  ): {
    isValid: boolean;
    mainError?: string;
    panError?: string;
    nameError?: string;
    structured?: StructuredIDProof;
    formattedDisplay: string;
  } => {
    const t = type.toLowerCase();

    if (t === 'aadhaar') {
      const res = validateAadhaarNumber(mainVal);
      return {
        isValid: res.isValid,
        mainError: res.isValid ? undefined : (res.error || 'Aadhaar number must contain exactly 12 digits.'),
        structured: res.structured,
        formattedDisplay: res.formattedValue || mainVal
      };
    }

    if (t === 'pan') {
      const res = validatePANNumber(mainVal);
      return {
        isValid: res.isValid,
        mainError: res.isValid ? undefined : (res.error || 'Enter a valid PAN number.'),
        structured: res.structured,
        formattedDisplay: res.formattedValue || mainVal
      };
    }

    if (t.includes('aadhaar + pan') || (t.includes('aadhaar') && t.includes('pan'))) {
      const aRes = validateAadhaarNumber(mainVal);
      const pRes = validatePANNumber(panVal);
      const isValid = aRes.isValid && pRes.isValid;
      return {
        isValid,
        mainError: aRes.isValid ? undefined : (aRes.error || 'Aadhaar number must contain exactly 12 digits.'),
        panError: pRes.isValid ? undefined : (pRes.error || 'Enter a valid PAN number.'),
        structured: isValid
          ? {
              type: 'AADHAAR_PAN',
              aadhaarNumber: aRes.normalizedValue,
              panNumber: pRes.normalizedValue
            }
          : undefined,
        formattedDisplay: `${aRes.formattedValue || mainVal} / ${pRes.formattedValue || panVal}`
      };
    }

    if (t.includes('voter')) {
      const res = validateVoterId(mainVal);
      return {
        isValid: res.isValid,
        mainError: res.isValid ? undefined : 'Enter a valid Voter ID.',
        structured: res.structured,
        formattedDisplay: res.formattedValue || mainVal
      };
    }

    if (t.includes('driving') || t.includes('licence') || t.includes('license')) {
      const res = validateDrivingLicence(mainVal);
      return {
        isValid: res.isValid,
        mainError: res.isValid ? undefined : 'Enter a valid Driving Licence Number.',
        structured: res.structured,
        formattedDisplay: res.formattedValue || mainVal
      };
    }

    if (t.includes('passport')) {
      const res = validatePassport(mainVal);
      return {
        isValid: res.isValid,
        mainError: res.isValid ? undefined : 'Enter a valid Passport Number.',
        structured: res.structured,
        formattedDisplay: res.formattedValue || mainVal
      };
    }

    if (t.includes('other')) {
      const res = validateOtherDocument(nameVal, mainVal);
      return {
        isValid: res.isValid,
        nameError: res.nameError,
        mainError: res.numError,
        structured: res.structured,
        formattedDisplay: `${nameVal}: ${mainVal}`
      };
    }

    // Default fallback
    const isValid = mainVal.trim().length >= 3;
    return {
      isValid,
      mainError: isValid ? undefined : 'Enter a valid document number.',
      structured: {
        type: type.toUpperCase().replace(/\s+/g, '_'),
        documentNumber: mainVal.trim()
      },
      formattedDisplay: mainVal.trim()
    };
  };

  const currentValidation = evaluateValidation(currentType, idNumber, extraPan, docName);

  // Handle Type Change & preserve existing values for dynamic fields
  const handleTypeChange = (newType: string) => {
    setTouchedMain(false);
    setTouchedPan(false);
    setTouchedDocName(false);

    let nextIdNumber = idNumber;
    let nextExtraPan = extraPan;
    let nextDocName = docName;

    const newTypeLower = newType.toLowerCase();

    if (newTypeLower.includes('aadhaar')) {
      if (nextIdNumber && nextIdNumber.replace(/\D/g, '').length === 12) {
        nextIdNumber = formatAadhaarInput(nextIdNumber);
      }
    }

    const newValidation = evaluateValidation(newType, nextIdNumber, nextExtraPan, nextDocName);

    onChange({
      idProof: newType,
      idNumber: nextIdNumber,
      extraPan: nextExtraPan,
      docName: nextDocName,
      isValid: newValidation.isValid,
      error: newValidation.mainError || newValidation.panError || newValidation.nameError,
      structured: newValidation.structured
    });
  };

  const handleMainNumberChange = (rawInput: string) => {
    setTouchedMain(true);
    let updatedVal = rawInput;
    const t = currentType.toLowerCase();

    if (t === 'aadhaar' || t.includes('aadhaar + pan')) {
      const digits = rawInput.replace(/\D/g, '').slice(0, 12);
      updatedVal = formatAadhaarInput(digits);
    } else if (t === 'pan') {
      updatedVal = rawInput.toUpperCase().replace(/\s/g, '').slice(0, 10);
    } else if (t.includes('voter') || t.includes('driving') || t.includes('passport')) {
      updatedVal = rawInput.toUpperCase();
    } else if (t.includes('other')) {
      updatedVal = rawInput.toUpperCase();
    }

    const valRes = evaluateValidation(currentType, updatedVal, extraPan, docName);

    onChange({
      idProof: currentType,
      idNumber: updatedVal,
      extraPan,
      docName,
      isValid: valRes.isValid,
      error: valRes.mainError || valRes.panError || valRes.nameError,
      structured: valRes.structured
    });
  };

  const handleExtraPanChange = (rawInput: string) => {
    setTouchedPan(true);
    const updatedPan = rawInput.toUpperCase().replace(/\s/g, '').slice(0, 10);
    const valRes = evaluateValidation(currentType, idNumber, updatedPan, docName);

    onChange({
      idProof: currentType,
      idNumber,
      extraPan: updatedPan,
      docName,
      isValid: valRes.isValid,
      error: valRes.mainError || valRes.panError || valRes.nameError,
      structured: valRes.structured
    });
  };

  const handleDocNameChange = (rawInput: string) => {
    setTouchedDocName(true);
    const updatedName = rawInput;
    const valRes = evaluateValidation(currentType, idNumber, extraPan, updatedName);

    onChange({
      idProof: currentType,
      idNumber,
      extraPan,
      docName: updatedName,
      isValid: valRes.isValid,
      error: valRes.mainError || valRes.panError || valRes.nameError,
      structured: valRes.structured
    });
  };

  const isAadhaarPan = currentType.toLowerCase().includes('aadhaar + pan') || (currentType.toLowerCase().includes('aadhaar') && currentType.toLowerCase().includes('pan'));
  const isOther = currentType.toLowerCase().includes('other');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. ID Proof Type Dropdown */}
      <div className="form-group">
        <label className="form-label required">ID Proof Type</label>
        <select
          className="select-control"
          value={currentType}
          disabled={disabled}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {ID_PROOF_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* 2. DYNAMIC INPUT FIELDS */}

      {/* CASE A: OTHER (Document Name + Document Number) */}
      {isOther && (
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label required">Document Name</label>
            <input
              type="text"
              className="input-control"
              placeholder="e.g. Ration Card, Employee ID, College ID"
              value={docName}
              disabled={disabled}
              style={{
                borderColor: touchedDocName && currentValidation.nameError ? 'var(--color-danger, #ef4444)' : undefined
              }}
              onChange={(e) => handleDocNameChange(e.target.value)}
              onBlur={() => setTouchedDocName(true)}
            />
            {touchedDocName && currentValidation.nameError && (
              <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                {currentValidation.nameError}
              </small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label required">Document Number / ID</label>
            <input
              type="text"
              className="input-control"
              placeholder="Enter document number"
              value={idNumber}
              disabled={disabled}
              style={{
                borderColor: touchedMain && currentValidation.mainError ? 'var(--color-danger, #ef4444)' : undefined
              }}
              onChange={(e) => handleMainNumberChange(e.target.value)}
              onBlur={() => setTouchedMain(true)}
            />
            {touchedMain && currentValidation.mainError && (
              <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                {currentValidation.mainError}
              </small>
            )}
          </div>
        </div>
      )}

      {/* CASE B: AADHAAR + PAN (Two separate required fields) */}
      {isAadhaarPan && (
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label required">Aadhaar Number</label>
            <input
              type="text"
              className="input-control"
              placeholder="Enter 12-digit Aadhaar number"
              maxLength={14}
              value={idNumber}
              disabled={disabled}
              style={{
                borderColor: touchedMain && currentValidation.mainError ? 'var(--color-danger, #ef4444)' : undefined
              }}
              onChange={(e) => handleMainNumberChange(e.target.value)}
              onBlur={() => setTouchedMain(true)}
            />
            {touchedMain && currentValidation.mainError && (
              <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                {currentValidation.mainError}
              </small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label required">PAN Number</label>
            <input
              type="text"
              className="input-control"
              placeholder="ABCDE1234F"
              maxLength={10}
              value={extraPan}
              disabled={disabled}
              style={{
                borderColor: touchedPan && currentValidation.panError ? 'var(--color-danger, #ef4444)' : undefined
              }}
              onChange={(e) => handleExtraPanChange(e.target.value)}
              onBlur={() => setTouchedPan(true)}
            />
            {touchedPan && currentValidation.panError && (
              <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                {currentValidation.panError}
              </small>
            )}
          </div>
        </div>
      )}

      {/* CASE C: SINGLE FIELD (Aadhaar, PAN, Voter ID, Driving Licence, Passport) */}
      {!isOther && !isAadhaarPan && (
        <div className="form-group">
          <label className="form-label required">
            {currentType.toLowerCase().includes('aadhaar') && 'Aadhaar Number'}
            {currentType.toLowerCase().includes('pan') && 'PAN Number'}
            {currentType.toLowerCase().includes('voter') && 'Voter ID Number'}
            {(currentType.toLowerCase().includes('driving') || currentType.toLowerCase().includes('licence') || currentType.toLowerCase().includes('license')) && 'Driving Licence Number'}
            {currentType.toLowerCase().includes('passport') && 'Passport Number'}
            {!currentType.toLowerCase().includes('aadhaar') &&
             !currentType.toLowerCase().includes('pan') &&
             !currentType.toLowerCase().includes('voter') &&
             !currentType.toLowerCase().includes('driving') &&
             !currentType.toLowerCase().includes('licence') &&
             !currentType.toLowerCase().includes('passport') &&
             'ID Proof Number'}
          </label>
          <input
            type="text"
            className="input-control"
            placeholder={
              currentType.toLowerCase().includes('aadhaar') ? 'Enter 12-digit Aadhaar number' :
              currentType.toLowerCase().includes('pan') ? 'ABCDE1234F' :
              currentType.toLowerCase().includes('voter') ? 'Enter Voter ID' :
              (currentType.toLowerCase().includes('driving') || currentType.toLowerCase().includes('licence')) ? 'Enter Driving Licence Number' :
              currentType.toLowerCase().includes('passport') ? 'Enter Passport Number' :
              'Enter ID Proof Number'
            }
            maxLength={
              currentType.toLowerCase().includes('aadhaar') ? 14 :
              currentType.toLowerCase().includes('pan') ? 10 :
              currentType.toLowerCase().includes('passport') ? 9 : 25
            }
            value={idNumber}
            disabled={disabled}
            style={{
              borderColor: touchedMain && currentValidation.mainError ? 'var(--color-danger, #ef4444)' : undefined
            }}
            onChange={(e) => handleMainNumberChange(e.target.value)}
            onBlur={() => setTouchedMain(true)}
          />
          {touchedMain && currentValidation.mainError && (
            <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
              {currentValidation.mainError}
            </small>
          )}
        </div>
      )}
    </div>
  );
};
