import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DatePickerProps {
  isoValue: string; // YYYY-MM-DD
  displayValue: string; // DD-MM-YYYY
  onChange: (isoDate: string, displayDate: string) => void;
  placeholder?: string;
  error?: string;
  minYear?: number;
  maxYear?: number;
  maxDateIso?: string; // Optional max limit e.g. for DOB (today)
  minDateIso?: string; // Optional min limit
  readOnlyInput?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePicker: React.FC<DatePickerProps> = ({
  isoValue,
  displayValue,
  onChange,
  placeholder = 'DD-MM-YYYY',
  error,
  minYear = 1920,
  maxYear = 2040,
  maxDateIso,
  minDateIso,
  readOnlyInput = true
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  const todayIso = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;

  // Parse initial view year & month from isoValue if valid
  const getInitialYearMonth = useCallback(() => {
    if (isoValue && isoValue.length === 10) {
      const parts = isoValue.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && y >= minYear && y <= maxYear && m >= 0 && m <= 11) {
          return { year: y, month: m };
        }
      }
    }
    return { year: todayYear, month: todayMonth };
  }, [isoValue, minYear, maxYear, todayYear, todayMonth]);

  const initial = getInitialYearMonth();
  const [viewYear, setViewYear] = useState<number>(initial.year);
  const [viewMonth, setViewMonth] = useState<number>(initial.month);

  // Sync view when isoValue changes externally
  useEffect(() => {
    if (isoValue && isoValue.length === 10) {
      const parts = isoValue.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && y >= minYear && y <= maxYear && m >= 0 && m <= 11) {
          setViewYear(y);
          setViewMonth(m);
        }
      }
    }
  }, [isoValue, minYear, maxYear]);

  // Click outside & Escape key listeners
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Select Day Handler
  const handleSelectDay = (dayNum: number) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    
    const selectedIso = `${viewYear}-${monthStr}-${dayStr}`;
    const formattedDisplay = `${dayStr}-${monthStr}-${viewYear}`;

    // Validate bounds if specified
    if (maxDateIso && selectedIso > maxDateIso) return;
    if (minDateIso && selectedIso < minDateIso) return;

    onChange(selectedIso, formattedDisplay);
    setIsOpen(false);
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => Math.max(minYear, prev - 1));
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => Math.min(maxYear, prev + 1));
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Today Quick Action
  const handleSelectToday = () => {
    const monthStr = String(todayMonth + 1).padStart(2, '0');
    const dayStr = String(todayDate).padStart(2, '0');
    const formattedDisplay = `${dayStr}-${monthStr}-${todayYear}`;

    setViewYear(todayYear);
    setViewMonth(todayMonth);
    onChange(todayIso, formattedDisplay);
    setIsOpen(false);
  };

  // Days Grid Math
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Year options array
  const yearOptions = [];
  for (let y = maxYear; y >= minYear; y--) {
    yearOptions.push(y);
  }

  // Selected Day number if in current view
  const selectedDayNum = (() => {
    if (isoValue && isoValue.length === 10) {
      const parts = isoValue.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (y === viewYear && m === viewMonth) return d;
      }
    }
    return null;
  })();

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input Field Container */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          className={`input-control ${error ? 'error' : ''}`}
          placeholder={placeholder}
          readOnly={readOnlyInput}
          value={displayValue}
          onClick={() => setIsOpen(prev => !prev)}
          onFocus={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label="Date Picker"
          style={{
            cursor: 'pointer',
            paddingRight: '38px',
            backgroundColor: 'var(--bg-input)',
            color: displayValue ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600,
            borderColor: error ? '#EF4444' : undefined
          }}
        />
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-label="Open Calendar"
          style={{
            position: 'absolute',
            right: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--color-primary-dark)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition-fast)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <CalendarIcon size={18} />
        </button>
      </div>

      {/* Validation Message */}
      {error && (
        <small style={{ color: '#EF4444', fontSize: '11px', marginTop: '4px', display: 'block', fontWeight: 600 }}>
          {error}
        </small>
      )}

      {/* Calendar Dropdown Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Calendar Popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 300,
            width: '290px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {/* Popover Header Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 6px', height: '28px', minWidth: '28px' }}
              onClick={handlePrevMonth}
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>

            <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
              {/* Month Select */}
              <select
                className="input-control"
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                style={{
                  padding: '2px 6px',
                  fontSize: '12px',
                  height: '28px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>

              {/* Year Select */}
              <select
                className="input-control"
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                style={{
                  padding: '2px 6px',
                  fontSize: '12px',
                  height: '28px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '78px'
                }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 6px', height: '28px', minWidth: '28px' }}
              onClick={handleNextMonth}
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday Names Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: '2px' }}>
            {DAY_NAMES.map(d => (
              <span key={d} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', padding: '2px 0' }}>
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {/* Empty padding cells */}
            {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
              <div key={`empty-${idx}`} style={{ height: '30px' }} />
            ))}

            {/* Day Cells */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const cellMonthStr = String(viewMonth + 1).padStart(2, '0');
              const cellDayStr = String(dayNum).padStart(2, '0');
              const cellIso = `${viewYear}-${cellMonthStr}-${cellDayStr}`;

              const isToday = cellIso === todayIso;
              const isSelected = selectedDayNum === dayNum;

              let isDisabled = false;
              if (maxDateIso && cellIso > maxDateIso) isDisabled = true;
              if (minDateIso && cellIso < minDateIso) isDisabled = true;

              return (
                <button
                  key={dayNum}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(dayNum)}
                  style={{
                    height: '30px',
                    width: '30px',
                    margin: 'auto',
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected
                      ? '1px solid var(--color-primary-accent)'
                      : isToday
                      ? '1px solid var(--color-gold)'
                      : 'none',
                    backgroundColor: isSelected
                      ? 'var(--color-primary-accent)'
                      : isToday
                      ? 'rgba(201, 162, 39, 0.15)'
                      : 'transparent',
                    color: isSelected
                      ? '#FFFFFF'
                      : isToday
                      ? 'var(--color-gold)'
                      : isDisabled
                      ? 'var(--text-muted)'
                      : 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: isSelected || isToday ? 800 : 500,
                    opacity: isDisabled ? 0.35 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isDisabled && !isSelected) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = isToday ? 'rgba(201, 162, 39, 0.15)' : 'transparent';
                    }
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Quick Action Footer */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600 }}
              onClick={handleSelectToday}
            >
              Today
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {displayValue || placeholder}
            </span>
          </div>

        </div>
      )}
    </div>
  );
};
