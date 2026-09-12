import React, { useState } from 'react';
import { authService, isSupabaseConfigured } from '../lib/supabase';
import { UserSession } from '../types';

interface AuthViewProps {
  onAuthSuccess: (session: UserSession, isNewUser?: boolean) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isForgotLoading, setIsForgotLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const session = await authService.signInWithEmail(email.trim(), password);
        onAuthSuccess(session, false);
      } else {
        const session = await authService.signUpWithEmail(email.trim(), password, name.trim());
        onAuthSuccess(session, true);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const session = await authService.signInAsGuest();
      onAuthSuccess(session, true);
    } catch (err: any) {
      setErrorMsg('Could not initialize guest session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setIsForgotLoading(true);
    try {
      const res = await authService.resetPasswordForEmail(forgotEmail.trim());
      setForgotStatus(res);
    } catch (err: any) {
      setForgotStatus({ success: false, message: err?.message || 'Failed to send reset link.' });
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div
      id="auth-screen"
      className="relative flex flex-col justify-between min-h-screen px-6 py-8 text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-950 select-none overflow-y-auto"
    >
      {/* Background ambient accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-72 bg-emerald-100/50 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-60 h-60 bg-emerald-100/40 dark:bg-blue-950/20 rounded-full blur-2xl pointer-events-none" />

      {/* Top Brand Header */}
      <div className="relative z-10 pt-4 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm mb-3">
          {/* Ascend Emblem */}
          <svg className="w-8 h-8 text-emerald-600 dark:text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              d="M12 3v18m0-18l-6 6m6-6l6 6M4 21h16"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Ascend</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 max-w-[280px] mx-auto font-medium">
          Habit architecture powered by continuous identity momentum.
        </p>

        {isSupabaseConfigured && (
          <div className="inline-flex items-center space-x-1 mt-2 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-blue-950 border border-emerald-200 dark:border-blue-800 text-[10px] text-emerald-700 dark:text-blue-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-blue-500 animate-pulse" />
            <span>Supabase Cloud Connected</span>
          </div>
        )}
      </div>

      {/* Auth Card */}
      <div className="relative z-10 my-auto py-4">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl p-6 border border-slate-200/90 dark:border-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          {/* Segment Toggle */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
            <button
              type="button"
              id="auth-tab-login"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-[12.5px] font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="auth-tab-signup"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 text-[12.5px] font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-[12px] text-rose-700 dark:text-rose-300 leading-snug flex items-start space-x-2 animate-in fade-in"
            >
              <span className="text-base leading-none font-bold">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  id="auth-input-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maya Lin"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13.5px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                id="auth-input-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13.5px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotStatus(null);
                      setIsForgotModalOpen(true);
                    }}
                    className="text-[11px] text-emerald-700 dark:text-blue-400 hover:text-emerald-800 dark:hover:text-blue-300 font-semibold cursor-pointer"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-input-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13.5px] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500 transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13.5px] shadow-sm hover:bg-emerald-600 dark:hover:bg-blue-500 active:scale-[0.99] transition cursor-pointer disabled:opacity-60 flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
                </>
              ) : (
                <span>{mode === 'login' ? 'Sign In to Ascend' : 'Start Identity Journey'}</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <span className="relative px-3 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              or
            </span>
          </div>

          {/* Anonymous / Guest Access */}
          <button
            id="auth-guest-btn"
            type="button"
            onClick={handleGuestLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-emerald-50/60 dark:bg-blue-950/60 hover:bg-emerald-100/80 dark:hover:bg-blue-900/60 border border-emerald-200/80 dark:border-blue-800 text-emerald-900 dark:text-blue-200 rounded-xl font-bold text-[12.5px] transition active:scale-[0.99] cursor-pointer flex items-center justify-center space-x-2"
          >
            <span>👤</span>
            <span>Continue as Guest / Anonymous</span>
          </button>
          <p className="text-[10.5px] text-slate-400 text-center mt-2">
            Local device storage with zero sign-up required. Upgrade anytime.
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Reset Password</h3>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Enter your account email and we will send you a secure recovery link.
            </p>

            {forgotStatus && (
              <div
                className={`p-2.5 rounded-xl text-[11.5px] font-medium ${
                  forgotStatus.success
                    ? 'bg-emerald-50 dark:bg-blue-950 text-emerald-800 dark:text-blue-200 border border-emerald-200 dark:border-blue-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900'
                }`}
              >
                {forgotStatus.message}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
              />
              <div className="flex space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[12px] hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isForgotLoading}
                  className="flex-1 py-2 rounded-xl bg-[#23C15D] dark:bg-blue-600 text-white font-bold text-[12px] hover:bg-emerald-600 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-50"
                >
                  {isForgotLoading ? 'Sending...' : 'Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer text */}
      <div className="relative z-10 text-center pb-2 text-[11px] text-slate-400">
        Strict privacy by design • Pure momentum engine • Offline resilient
      </div>
    </div>
  );
};
