import React, { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { RefreshCw } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const { userRole, currentUser, authLoading } = useApp();

  // If authentication state is still resolving
  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          gap: '16px',
          color: '#0F5132'
        }}
      >
        <RefreshCw size={36} className="spin-animation" style={{ color: '#0F5132' }} />
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>
          Verifying security session...
        </span>
      </div>
    );
  }

  // If unauthenticated
  if (!userRole || !currentUser) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return null;
  }

  // Authenticated
  return <>{children}</>;
};

export default ProtectedRoute;
