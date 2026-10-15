import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LoginView } from '../components/auth/LoginView';
import { ConfigurationCenterModal } from '../components/config/ConfigurationCenterModal';

export const Login: React.FC = () => {
  const {
    authLoading,
    loginWithCredentials
  } = useApp();

  const [loginEmail, setLoginEmail] = useState('kkvgoldfinance13@gmail.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both email/staff ID and password.');
      return;
    }

    setIsLoggingIn(true);
    const res = await loginWithCredentials(loginEmail.trim(), loginPassword);
    setIsLoggingIn(false);

    if (!res.success) {
      setLoginError(res.message || 'Incorrect email/staff ID or password.');
    }
  };

  return (
    <>
      <LoginView
        loginEmail={loginEmail}
        setLoginEmail={setLoginEmail}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        loginError={loginError}
        isLoggingIn={isLoggingIn}
        authLoading={authLoading}
        handleLogin={handleLogin}
        onOpenConfig={() => setShowConfigModal(true)}
      />

      {showConfigModal && (
        <ConfigurationCenterModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </>
  );
};

export default Login;
