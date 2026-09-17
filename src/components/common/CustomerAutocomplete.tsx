import React, { useState, useEffect, useRef } from 'react';
import { User } from 'lucide-react';
import { SearchInput } from './SearchInput';
import { useApp } from '../../context/AppContext';
import { Customer } from '../../types';

export interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomer: (customer: Customer) => void;
  placeholder?: string;
  searchBy?: 'name' | 'phone' | 'all';
  label?: string;
}

export const CustomerAutocomplete: React.FC<CustomerAutocompleteProps> = ({
  value,
  onChange,
  onSelectCustomer,
  placeholder = 'Type customer name or phone...',
  searchBy = 'all',
  label
}) => {
  const { customers } = useApp();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (q: string) => {
    const queryStr = q.toLowerCase().trim();
    if (!queryStr) {
      setFilteredCustomers([]);
      setIsOpen(false);
      return;
    }

    const matches = customers.filter((c) => {
      if (searchBy === 'name') {
        return c.name.toLowerCase().includes(queryStr);
      } else if (searchBy === 'phone') {
        return c.phone.includes(queryStr);
      }
      return (
        c.name.toLowerCase().includes(queryStr) ||
        c.phone.includes(queryStr) ||
        c.id.toLowerCase().includes(queryStr)
      );
    });

    setFilteredCustomers(matches.slice(0, 6));
    setIsOpen(matches.length > 0);
  };

  const handleSelect = (customer: Customer) => {
    onChange(searchBy === 'phone' ? customer.phone : customer.name);
    onSelectCustomer(customer);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label className="form-label" style={{ marginBottom: '6px' }}>
          {label}
        </label>
      )}

      <SearchInput
        value={value}
        onChange={onChange}
        onDebouncedChange={handleSearch}
        placeholder={placeholder}
        onFocus={() => {
          if (value.trim()) handleSearch(value);
        }}
      />

      {/* Dropdown Suggestions Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.12))',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 1100,
            padding: '4px 0'
          }}
        >
          {filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              onClick={() => handleSelect(cust)}
              style={{
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(201, 162, 39, 0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(201, 162, 39, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <User size={15} color="var(--color-primary-dark)" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-dark)' }}>
                    {cust.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    📱 {cust.phone} • {cust.occupation || 'Customer'}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--color-primary-dark)', fontWeight: 600 }}>
                {cust.activeLoansCount > 0 ? `${cust.activeLoansCount} loan(s)` : 'No active loans'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
