import React from 'react';
import { ShieldAlert, Home } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface AccessDeniedProps {
  requestedArea?: string;
  onGoBack?: () => void;
  onNavigateHome?: () => void;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  requestedArea = 'Administrative Module',
  onGoBack,
  onNavigateHome
}) => {
  const { userRole, currentUser, setCurrentPage } = useApp();

  const handleReturnToDashboard = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else if (onGoBack) {
      onGoBack();
    } else {
      setCurrentPage('dashboard');
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: '16px',
        padding: '36px 32px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--border-color, #e5e7eb)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#FEE2E2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#DC2626'
        }}>
          <ShieldAlert size={36} />
        </div>

        <h1 style={{
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--text-primary, #111827)',
          marginBottom: '10px'
        }}>
          403 — Access Denied
        </h1>

        <p style={{
          fontSize: '14px',
          color: 'var(--text-secondary, #6B7280)',
          lineHeight: '1.5',
          marginBottom: '24px'
        }}>
          You do not have permission to access <strong>{requestedArea}</strong>.
          Administrative privileges are required for this section.
        </p>

        <div style={{
          backgroundColor: 'var(--bg-secondary, #f9fafb)',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '28px',
          fontSize: '13px',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          border: '1px solid var(--border-color, #e5e7eb)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #6B7280)' }}>Current User:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
              {currentUser?.displayName || currentUser?.fullName || currentUser?.email || 'Authenticated User'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary, #6B7280)' }}>Active Role:</span>
            <span style={{
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: userRole === 'ADMIN' ? '#DCFCE7' : '#E0E7FF',
              color: userRole === 'ADMIN' ? '#166534' : '#3730A3',
              fontSize: '11px',
              textTransform: 'uppercase'
            }}>
              {userRole || 'STAFF'}
            </span>
          </div>
        </div>

        <button
          onClick={handleReturnToDashboard}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            borderRadius: '10px',
            backgroundColor: '#0B6B4A',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '14px',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            width: '100%'
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#085037')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#0B6B4A')}
        >
          <Home size={18} />
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
