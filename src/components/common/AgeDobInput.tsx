import React, { useState, useEffect, useRef } from 'react';
import { Calendar, CheckCircle2 } from 'lucide-react';

export interface AgeDobValue {
  mode: 'dob' | 'age';
  dateOfBirth: string;
  age: number;
}

export interface AgeDobInputProps {
  dateOfBirth?: string;
  age?: number;
  initialMode?: 'dob' | 'age';
  onChange: (value: AgeDobValue) => void;
}

export function parseDateString(dateStr: string): { day: number; month: number; year: number } | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // Match YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return { day, month, year };
  }

  // Match DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    return { day, month, year };
  }

  return null;
}

export function isValidDateParts(day: number, month: number, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return false;
  if (month < 1 || month > 12) return false;

  // Validate days in month taking leap years into account
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;

  const dateObj = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (dateObj > today) return false; // Future dates not permitted

  return true;
}

export function calculateAgeFromDob(dobString: string): number | null {
  if (!dobString) return null;
  const parts = parseDateString(dobString);
  if (!parts || !isValidDateParts(parts.day, parts.month, parts.year)) return null;

  const birthDate = new Date(parts.year, parts.month - 1, parts.day);
  const today = new Date();

  let calculatedAge = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    calculatedAge--;
  }
  return calculatedAge >= 0 && calculatedAge <= 120 ? calculatedAge : null;
}

export function toIsoDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = parseDateString(dateStr);
  if (!parts || !isValidDateParts(parts.day, parts.month, parts.year)) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function toDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = parseDateString(dateStr);
  if (!parts || !isValidDateParts(parts.day, parts.month, parts.year)) return dateStr;
  return `${String(parts.day).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`;
}

export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export const AgeDobInput: React.FC<AgeDobInputProps> = ({
  dateOfBirth = '',
  age = 30,
  initialMode = 'age',
  onChange
}) => {
  const [mode, setMode] = useState<'dob' | 'age'>(initialMode);
  const [displayVal, setDisplayVal] = useState<string>(toDisplayDate(dateOfBirth));
  const [isoVal, setIsoVal] = useState<string>(toIsoDate(dateOfBirth));
  const [ageVal, setAgeVal] = useState<number>(age || 30);
  const [inputError, setInputError] = useState<string>('');

  const datePickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (dateOfBirth) {
      const disp = toDisplayDate(dateOfBirth);
      const iso = toIsoDate(dateOfBirth);
      setDisplayVal(disp);
      setIsoVal(iso);
      const calc = calculateAgeFromDob(dateOfBirth);
      if (calc !== null) {
        setAgeVal(calc);
      }
    } else {
      setDisplayVal('');
      setIsoVal('');
    }
  }, [dateOfBirth]);

  useEffect(() => {
    if (age && mode === 'age') {
      setAgeVal(age);
    }
  }, [age, mode]);

  const handleModeChange = (newMode: 'dob' | 'age') => {
    setMode(newMode);
    setInputError('');
    if (newMode === 'dob') {
      const calculated = calculateAgeFromDob(displayVal || isoVal);
      const finalAge = calculated !== null ? calculated : ageVal;
      onChange({ mode: 'dob', dateOfBirth: isoVal || displayVal, age: finalAge });
    } else {
      onChange({ mode: 'age', dateOfBirth: '', age: ageVal });
    }
  };

  const handleManualDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDobInput(e.target.value);
    setDisplayVal(formatted);

    if (!formatted) {
      setIsoVal('');
      setInputError('');
      onChange({ mode: 'dob', dateOfBirth: '', age: ageVal });
      return;
    }

    if (formatted.length === 10) {
      const parts = parseDateString(formatted);
      if (!parts || !isValidDateParts(parts.day, parts.month, parts.year)) {
        setInputError('Please enter a valid date (DD-MM-YYYY)');
        return;
      }

      setInputError('');
      const iso = toIsoDate(formatted);
      setIsoVal(iso);
      const calc = calculateAgeFromDob(formatted);
      const finalAge = calc !== null ? calc : ageVal;
      if (calc !== null) {
        setAgeVal(calc);
      }
      onChange({ mode: 'dob', dateOfBirth: iso, age: finalAge });
    } else {
      setInputError('');
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawIso = e.target.value; // YYYY-MM-DD
    if (!rawIso) {
      setDisplayVal('');
      setIsoVal('');
      setInputError('');
      onChange({ mode: 'dob', dateOfBirth: '', age: ageVal });
      return;
    }

    const disp = toDisplayDate(rawIso);
    setDisplayVal(disp);
    setIsoVal(rawIso);
    setInputError('');

    const calc = calculateAgeFromDob(rawIso);
    const finalAge = calc !== null ? calc : ageVal;
    if (calc !== null) {
      setAgeVal(calc);
    }
    onChange({ mode: 'dob', dateOfBirth: rawIso, age: finalAge });
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 0));
    setAgeVal(val);
    onChange({ mode: 'age', dateOfBirth: '', age: val });
  };

  const openCalendarPicker = () => {
    if (datePickerRef.current) {
      if (typeof datePickerRef.current.showPicker === 'function') {
        datePickerRef.current.showPicker();
      } else {
        datePickerRef.current.focus();
        datePickerRef.current.click();
      }
    }
  };

  const currentCalcAge = mode === 'dob' ? calculateAgeFromDob(displayVal || isoVal) : null;

  return (
    <div className="form-group" style={{ margin: 0 }}>
      {/* Header Label + Segmented Control Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '6px'
        }}
      >
        <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>
          AGE / DATE OF BIRTH
        </label>

        {/* Segmented Control Pill Toggle */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--bg-surface-secondary, #f1f5f9)',
            padding: '3px',
            borderRadius: '20px',
            border: '1px solid var(--border-light, #cbd5e1)'
          }}
        >
          <button
            type="button"
            onClick={() => handleModeChange('dob')}
            style={{
              padding: '3px 12px',
              fontSize: '11.5px',
              fontWeight: 800,
              borderRadius: '16px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backgroundColor: mode === 'dob' ? 'var(--color-primary-accent, #059669)' : 'transparent',
              color: mode === 'dob' ? '#ffffff' : 'var(--text-muted, #64748b)',
              boxShadow: mode === 'dob' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none'
            }}
          >
            DOB
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('age')}
            style={{
              padding: '3px 12px',
              fontSize: '11.5px',
              fontWeight: 800,
              borderRadius: '16px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backgroundColor: mode === 'age' ? 'var(--color-primary-accent, #059669)' : 'transparent',
              color: mode === 'age' ? '#ffffff' : 'var(--text-muted, #64748b)',
              boxShadow: mode === 'age' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none'
            }}
          >
            AGE
          </button>
        </div>
      </div>

      {/* Input Area */}
      {mode === 'dob' ? (
        <div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Visible DD-MM-YYYY text input */}
            <input
              type="text"
              className="input-control"
              placeholder="DD-MM-YYYY"
              maxLength={10}
              value={displayVal}
              onChange={handleManualDobChange}
              style={{
                paddingRight: '40px',
                width: '100%',
                borderColor: inputError ? 'var(--color-danger, #ef4444)' : undefined
              }}
            />

            {/* Hidden native date picker used solely for invoking calendar dialog */}
            <input
              ref={datePickerRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              value={isoVal}
              max={new Date().toISOString().split('T')[0]}
              onChange={handlePickerChange}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -1
              }}
            />

            {/* Single Custom Calendar Button */}
            <button
              type="button"
              onClick={openCalendarPicker}
              title="Open Date Picker"
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary-dark, #059669)',
                borderRadius: '4px'
              }}
            >
              <Calendar size={16} />
            </button>
          </div>

          {inputError && (
            <small style={{ color: 'var(--color-danger, #ef4444)', fontSize: '11px', marginTop: '3px', display: 'block', fontWeight: 600 }}>
              {inputError}
            </small>
          )}

          {currentCalcAge !== null && (
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#059669',
                fontWeight: 700
              }}
            >
              <CheckCircle2 size={13} />
              <span>Calculated Age: <strong>{currentCalcAge} Years</strong></span>
            </div>
          )}
        </div>
      ) : (
        <div>
          <input
            type="number"
            min={1}
            max={120}
            className="input-control"
            placeholder="Enter customer age"
            value={ageVal || ''}
            onChange={handleAgeChange}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
            Age in years (e.g. 28)
          </span>
        </div>
      )}
    </div>
  );
};

