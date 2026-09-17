import React from 'react';
import {
  ShieldAlert,
  Mail,
  Lock,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  CheckCircle
} from 'lucide-react';
import { KKVLogo } from '../common/KKVLogo';
import './LoginView.css';

interface LoginViewProps {
  loginEmail: string;
  setLoginEmail: (val: string) => void;
  loginPassword: string;
  setLoginPassword: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  loginError: string;
  isLoggingIn: boolean;
  authLoading: boolean;
  handleLogin: (e: React.FormEvent) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  showPassword,
  setShowPassword,
  loginError,
  isLoggingIn,
  authLoading,
  handleLogin
}) => {
  return (
    <div className="kkv-login-wrapper">
      {/* LEFT SIDE — BRAND EXPERIENCE */}
      <div className="kkv-login-brand-pane">
        <div className="kkv-brand-glow-radial" />
        <div className="kkv-brand-glow-bottom" />
        <div className="kkv-brand-lines-pattern" />

        {/* Top Branding */}
        <div className="kkv-brand-header">
          <div className="kkv-brand-logo-pill">
            <KKVLogo size={34} />
          </div>
          <div className="kkv-brand-title-area">
            <span className="kkv-brand-name">KKV GOLD FINANCE</span>
            <span className="kkv-brand-tagline">Gold Finance &amp; Rental Management</span>
          </div>
        </div>

        {/* Main Hero Section */}
        <div className="kkv-brand-hero">
          <h1 className="kkv-brand-heading">
            Secure Access, Built on
            <br />
            <span className="kkv-brand-heading-gold">Trust.</span>
          </h1>

          <p className="kkv-brand-desc">
            Role-Based Access Control for Administration and Operations across Finance and Rental Management.
          </p>
        </div>

        {/* Trust Indicators */}
        <div className="kkv-trust-indicators">
          <div className="kkv-trust-item">
            <div className="kkv-trust-icon-box">
              <Lock size={15} />
            </div>
            <span>Encrypted Token Authentication</span>
          </div>

          <div className="kkv-trust-item">
            <div className="kkv-trust-icon-box">
              <Zap size={15} />
            </div>
            <span>Role-Based Access Control</span>
          </div>

          <div className="kkv-trust-item">
            <div className="kkv-trust-icon-box">
              <CheckCircle size={15} />
            </div>
            <span>Secure Operations Portal</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE — AUTHENTICATION FORM */}
      <div className="kkv-login-form-pane">
        <div className="kkv-login-container">
          {/* Mobile Header */}
          <div className="kkv-mobile-header">
            <div className="kkv-mobile-logo-wrap">
              <KKVLogo size={32} />
            </div>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0B6B4A' }}>
              KKV GOLD FINANCE
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#667085', letterSpacing: '0.8px', textTransform: 'uppercase', marginTop: '2px' }}>
              Gold Finance &amp; Rental System
            </span>
          </div>

          {/* Login Header */}
          <div className="kkv-login-header">
            <h2 className="kkv-login-title">Portal Login</h2>
            <p className="kkv-login-subtitle">
              Sign in with your email or staff username and password.
            </p>
          </div>

          {/* Error Banner */}
          {loginError && (
            <div className="kkv-alert-error" role="alert">
              <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{loginError}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleLogin} className="kkv-form-wrapper">
            {/* Email / Username */}
            <div className="kkv-form-group">
              <label className="kkv-input-label" htmlFor="kkv-login-email">
                Email / Staff ID
              </label>
              <div className="kkv-input-box">
                <Mail size={18} className="kkv-field-icon" />
                <input
                  id="kkv-login-email"
                  type="text"
                  required
                  className="kkv-text-input"
                  placeholder="kkvgoldfinance13@gmail.com or KKV-STAFF-000001"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="kkv-form-group">
              <div className="kkv-label-row">
                <label className="kkv-input-label" htmlFor="kkv-login-password">
                  Password
                </label>
              </div>
              <div className="kkv-input-box">
                <Lock size={18} className="kkv-field-icon" />
                <input
                  id="kkv-login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="kkv-password-input"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="kkv-visibility-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Sign In Primary CTA */}
            <button
              type="submit"
              className="kkv-submit-btn"
              disabled={isLoggingIn || authLoading}
            >
              {isLoggingIn || authLoading ? (
                <>
                  <RefreshCw size={18} className="kkv-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Security Message */}
          <div className="kkv-security-note">
            <Lock size={13} />
            <span>Authorized access only. All activities are securely logged.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
