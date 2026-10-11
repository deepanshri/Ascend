import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MotionModal } from './MotionModal';
import { authService } from '../lib/supabase';
import { tapPress } from '../lib/motionPresets';

const SUCCESS_CLOSE_DELAY_MS = 1800;

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Change-password form; owns its own input, status and loading state. */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  // Every opening starts from a clean form.
  useEffect(() => {
    if (!isOpen) return;
    setNewPassword('');
    setStatusMsg(null);
    setError(null);
  }, [isOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const close = () => {
    if (loading) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setStatusMsg(null);
    setLoading(true);
    try {
      // supabase.auth.updateUser via authService → PATCH {SUPABASE_URL}/auth/v1/user
      const err = await authService.changePassword(newPassword);
      if (err) {
        setError(err);
        return;
      }
      setStatusMsg('Password updated successfully.');
      setNewPassword('');
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
        setStatusMsg(null);
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal
      isOpen={isOpen}
      onClose={close}
      overlayClassName="bg-slate-900/60 backdrop-blur-xs"
      cardClassName="p-5 max-w-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Change Password</h3>
        <button
          type="button"
          disabled={loading}
          onClick={close}
          className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer disabled:opacity-50"
        >
          ✕
        </button>
      </div>

      {statusMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-blue-950 border border-emerald-200 dark:border-blue-800 text-emerald-800 dark:text-blue-300 text-[11.5px]">
          {statusMsg}
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11.5px]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-0.5">
            New Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[12.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-blue-500"
          />
        </div>

        <div className="flex space-x-2 pt-1">
          <motion.button
            type="button"
            whileTap={loading ? undefined : tapPress}
            disabled={loading}
            onClick={close}
            className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11.5px] hover:bg-slate-200 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            whileTap={loading ? undefined : tapPress}
            disabled={loading}
            className="flex-1 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-bold text-[11.5px] hover:bg-slate-800 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-60 flex items-center justify-center space-x-1.5"
          >
            {loading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </motion.button>
        </div>
      </form>
    </MotionModal>
  );
};
