import React, { useState } from 'react';
import { motion } from 'motion/react';
import { authService } from '../lib/supabase';
import { tapPress } from '../lib/motionPresets';

const SCREEN_CLASS =
  'relative flex flex-col justify-center h-full px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,calc(env(safe-area-inset-bottom)+var(--keyboard-inset,0px)))] text-slate-900 dark:text-white bg-[#F8FAF9] dark:bg-slate-950 overflow-y-auto overscroll-y-contain';
const PRIMARY_BUTTON_CLASS =
  'w-full py-2.5 px-4 bg-[#23C15D] dark:bg-blue-600 text-white rounded-xl font-bold text-[13px] hover:bg-emerald-600 dark:hover:bg-blue-500 cursor-pointer transition disabled:opacity-60 flex items-center justify-center space-x-1.5';

const Glow = () => (
  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-72 bg-emerald-100/50 dark:bg-blue-900/20 rounded-full blur-3xl pointer-events-none" />
);

/** Full-screen notice for an email link that could not sign the user in. */
export const AuthLinkProblemScreen: React.FC<{
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}> = ({ title, body, actionLabel, onAction }) => (
  <div id="auth-link-problem" role="alert" className={SCREEN_CLASS}>
    <Glow />
    <div className="relative z-10 flex flex-col items-center text-center space-y-5">
      <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm">
        <svg className="w-10 h-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="space-y-2 max-w-xs">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
      </div>
      <div className="max-w-xs w-full">
        <motion.button type="button" whileTap={tapPress} onClick={onAction} className={PRIMARY_BUTTON_CLASS}>
          {actionLabel}
        </motion.button>
      </div>
    </div>
  </div>
);

/** Shown while the tokens from an email link are exchanged for a session. */
export const AuthLinkWorkingScreen: React.FC = () => (
  <div className={SCREEN_CLASS} role="status" aria-live="polite">
    <Glow />
    <div className="relative z-10 flex flex-col items-center gap-3">
      <span className="w-6 h-6 border-2 border-emerald-200 dark:border-blue-900 border-t-emerald-600 dark:border-t-blue-500 rounded-full animate-spin" />
      <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">Signing you in…</p>
    </div>
  </div>
);

const SUCCESS_DELAY_MS = 1200;

/** After a reset-password link: the user is signed in and picks a new password. */
export const SetNewPasswordScreen: React.FC<{ email: string; onDone: () => void }> = ({ email, onDone }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || saved) return;
    setError(null);
    setLoading(true);
    try {
      const err = await authService.changePassword(password);
      if (err) {
        setError(err);
        return;
      }
      setSaved(true);
      window.setTimeout(onDone, SUCCESS_DELAY_MS);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="set-new-password" className={SCREEN_CLASS}>
      <Glow />
      <div className="relative z-10 max-w-xs w-full mx-auto space-y-5">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black tracking-tight">Set a new password</h1>
          {email && <p className="text-[13px] font-bold text-emerald-700 dark:text-blue-400 break-all">{email}</p>}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/95 dark:bg-slate-900/95 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3"
        >
          {saved && (
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950 border border-emerald-200 dark:border-blue-800 text-emerald-800 dark:text-blue-300 text-[11.5px]">
              Password updated. You're signed in.
            </div>
          )}
          {error && (
            <div role="alert" className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11.5px]">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="new-password" className="block text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-0.5">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 pr-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <motion.button
            type="submit"
            whileTap={loading || saved ? undefined : tapPress}
            disabled={loading || saved}
            className={PRIMARY_BUTTON_CLASS}
          >
            {loading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Password</span>
            )}
          </motion.button>
        </form>

        <button
          type="button"
          disabled={loading || saved}
          onClick={onDone}
          className="w-full text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer disabled:opacity-50"
        >
          Not now. I'll change it later in Settings.
        </button>
      </div>
    </div>
  );
};
