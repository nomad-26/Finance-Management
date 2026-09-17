import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onDebouncedChange?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  loading?: boolean;
  onClear?: () => void;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  id?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onDebouncedChange,
  placeholder = 'Search...',
  debounceMs = 250,
  loading = false,
  onClear,
  style,
  inputStyle,
  autoFocus = false,
  disabled = false,
  onKeyDown,
  onFocus,
  onBlur,
  id
}) => {
  const [internalValue, setInternalValue] = useState<string>(value);
  const isFirstRender = useRef<boolean>(true);

  // Sync prop changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Debounce handler
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!onDebouncedChange) return;

    const timer = setTimeout(() => {
      onDebouncedChange(internalValue);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [internalValue, debounceMs, onDebouncedChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInternalValue(val);
    onChange(val);
  };

  const handleClear = useCallback(() => {
    setInternalValue('');
    onChange('');
    if (onDebouncedChange) onDebouncedChange('');
    if (onClear) onClear();
  }, [onChange, onDebouncedChange, onClear]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        ...style
      }}
    >
      {/* Left Search Icon */}
      <Search
        size={16}
        style={{
          position: 'absolute',
          left: '12px',
          color: 'var(--text-muted, #94a3b8)',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      {/* Main Input Control */}
      <input
        id={id}
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          width: '100%',
          height: '38px',
          paddingLeft: '36px',
          paddingRight: internalValue || loading ? '34px' : '12px',
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-dark, #0f172a)',
          backgroundColor: 'var(--bg-input, #f8fafc)',
          border: '1px solid var(--border-light, #e2e8f0)',
          borderRadius: 'var(--radius-md, 8px)',
          outline: 'none',
          transition: 'all 0.2s ease',
          boxSizing: 'border-box',
          ...inputStyle
        }}
        className="search-input-control"
      />

      {/* Right Controls: Loading Spinner or Clear X Button */}
      {loading ? (
        <Loader2
          size={15}
          className="animate-spin"
          style={{
            position: 'absolute',
            right: '12px',
            color: 'var(--color-primary-accent, #c9a227)',
            pointerEvents: 'none'
          }}
        />
      ) : internalValue ? (
        <button
          type="button"
          onClick={handleClear}
          tabIndex={-1}
          style={{
            position: 'absolute',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted, #94a3b8)',
            borderRadius: '50%',
            transition: 'color 0.15s ease'
          }}
          title="Clear search"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};
