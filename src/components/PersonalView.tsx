import React, { useState, useEffect } from 'react';
import {
  User,
  Calendar,
  GraduationCap,
  MapPin,
  Heart,
  Plane,
  Target,
  Users,
  Plus,
  MessageSquare,
  ChevronRight,
  X,
  Check,
  Send,
  HelpCircle,
  Shield,
} from 'lucide-react';
import { IdentityEvidence, UserSession } from '../types';
import { FriendsFeed } from './FriendsFeed';
import { Mascot } from './Mascot';
import { ScreenHeader, SCREEN_INSET_CLASS } from './ScreenHeader';
import type { ProtectionModeStatus } from '../lib/protection';

interface PersonalViewProps {
  userSession: UserSession;
  evidenceList: IdentityEvidence[];
  identityVoteCount?: number;
  selectedInterests?: string[];
  onToggleInterest?: (interest: string) => void;
  examShieldActive?: boolean;
  examShieldStatus?: ProtectionModeStatus;
  onToggleExamShield?: () => void;
  vacationModeActive?: boolean;
  vacationStatus?: ProtectionModeStatus;
  onToggleVacationMode?: () => void;
  momentumScore?: number;
  onOpenSettings?: () => void;
  onOpenLedger: () => void;
  onUpgradeGuest: () => void;
  onSyncNow: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onUpdateName?: (name: string) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const PersonalView: React.FC<PersonalViewProps> = ({
  userSession,
  evidenceList,
  identityVoteCount,
  selectedInterests: propSelectedInterests,
  onToggleInterest,
  examShieldActive = false,
  examShieldStatus,
  onToggleExamShield,
  vacationModeActive = false,
  vacationStatus,
  onToggleVacationMode,
  momentumScore = 50,
  onOpenSettings,
  onOpenLedger,
  onUpgradeGuest,
  onSyncNow,
  onChangePassword,
  onLogout,
  onUpdateName,
  onScroll,
}) => {
  // Personal Details state (persisted locally)
  const [name, setName] = useState<string>(() => {
    return localStorage.getItem('ascend_user_name') || userSession.name || 'Alex';
  });
  const [dob, setDob] = useState<string>(() => {
    return localStorage.getItem('ascend_dob') || '12 Mar 2004';
  });
  const [university, setUniversity] = useState<string>(() => {
    return localStorage.getItem('ascend_university') || 'SASTRA University';
  });
  const [location, setLocation] = useState<string>(() => {
    return localStorage.getItem('ascend_location') || 'India';
  });

  // Personal Interests state (preset tags only - no custom tags)
  const PRESET_INTERESTS = ['Movies', 'Books', 'Anime', 'Running', 'Fitness', 'Coding', 'Music', 'Gaming'];
  const [localSelectedInterests, setLocalSelectedInterests] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ascend_personal_interests');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['Movies', 'Books', 'Anime', 'Running'];
  });

  const selectedInterests = propSelectedInterests || localSelectedInterests;

  // "What do you want to become?" aspiration state
  const [becomingGoal, setBecomingGoal] = useState<string>(() => {
    return localStorage.getItem('ascend_becoming_goal') || '';
  });

  // Modals state
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [isBecomingModalOpen, setIsBecomingModalOpen] = useState(false);
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Edit details form temp state
  const [tempName, setTempName] = useState(name);
  const [tempDob, setTempDob] = useState(dob);
  const [tempUniversity, setTempUniversity] = useState(university);
  const [tempLocation, setTempLocation] = useState(location);

  // Temp Becoming goal
  const [tempBecoming, setTempBecoming] = useState(becomingGoal);

  // Help & Feedback state
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Sync state & toast
  const [isSyncing, setIsSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Persist interests
  useEffect(() => {
    try {
      localStorage.setItem('ascend_personal_interests', JSON.stringify(selectedInterests));
    } catch {}
  }, [selectedInterests]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setName(tempName);
    setDob(tempDob);
    setUniversity(tempUniversity);
    setLocation(tempLocation);

    localStorage.setItem('ascend_user_name', tempName);
    localStorage.setItem('ascend_dob', tempDob);
    localStorage.setItem('ascend_university', tempUniversity);
    localStorage.setItem('ascend_location', tempLocation);

    if (onUpdateName && tempName.trim()) {
      onUpdateName(tempName.trim());
    }

    setIsEditDetailsOpen(false);
    showToast('Personal details updated!');
  };

  const handleSaveBecoming = (e: React.FormEvent) => {
    e.preventDefault();
    setBecomingGoal(tempBecoming);
    localStorage.setItem('ascend_becoming_goal', tempBecoming);
    setIsBecomingModalOpen(false);
    showToast('Identity goal updated!');
  };

  const toggleInterest = (tag: string) => {
    if (onToggleInterest) {
      onToggleInterest(tag);
    } else {
      setLocalSelectedInterests((prev) =>
        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
      );
    }
  };

  const handleSendFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setFeedbackSent(true);
    setTimeout(() => {
      setFeedbackSent(false);
      setFeedbackText('');
      setIsHelpModalOpen(false);
      showToast('Thank you! Your feedback has been received.');
    }, 1000);
  };

  const handleSyncClick = async () => {
    setIsSyncing(true);
    try {
      await onSyncNow();
      showToast('✓ Synced successfully with cloud storage!');
    } catch {
      showToast('Sync failed — you are offline or the cloud write did not succeed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const totalLifetimeExecutions = identityVoteCount ?? evidenceList.length;

  return (
    <div
      id="personal-screen"
      onScroll={onScroll}
      className={`absolute inset-0 px-4 ${SCREEN_INSET_CLASS} pb-24 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none`}
    >
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="sticky top-2 z-50 mx-auto w-fit px-4 py-1.5 rounded-2xl text-[12px] font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-2 border-[#23C15D] dark:border-blue-500 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 flex items-center space-x-2"
        >
          <span className="text-[#23C15D] font-bold">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <ScreenHeader
        title="Personal"
        subtitle="Your space. Your growth."
        onOpenSettings={onOpenSettings}
      />

      {/* CARD 1: PERSONAL DETAILS */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm space-y-4">
        <div
          onClick={() => {
            setTempName(name);
            setTempDob(dob);
            setTempUniversity(university);
            setTempLocation(location);
            setIsEditDetailsOpen(true);
          }}
          className="flex items-center justify-between cursor-pointer group"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 flex items-center justify-center shrink-0">
              <Mascot size={48} angle="front" momentumScore={momentumScore} animate />
            </div>
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">
              Personal Details
            </h2>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition" />
        </div>

        {/* Detail Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 pt-1">
          {/* Name */}
          <div className="py-2.5 flex items-center justify-between text-[13.5px]">
            <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400">
              <User className="w-4 h-4 text-slate-700 dark:text-slate-400" />
              <span>Name</span>
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {name}
            </span>
          </div>

          {/* Date of Birth */}
          <div className="py-2.5 flex items-center justify-between text-[13.5px]">
            <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400">
              <Calendar className="w-4 h-4 text-slate-700 dark:text-slate-400" />
              <span>Date of Birth</span>
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {dob}
            </span>
          </div>

          {/* University */}
          <div className="py-2.5 flex items-center justify-between text-[13.5px]">
            <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400">
              <GraduationCap className="w-4 h-4 text-slate-700 dark:text-slate-400" />
              <span>University</span>
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {university}
            </span>
          </div>

          {/* Location */}
          <div className="py-2.5 flex items-center justify-between text-[13.5px]">
            <div className="flex items-center space-x-2.5 text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4 text-slate-700 dark:text-slate-400" />
              <span>Location</span>
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {location}
            </span>
          </div>
        </div>
      </section>

      <section
        onClick={() => {
          setTempBecoming(becomingGoal);
          setIsBecomingModalOpen(true);
        }}
        className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-slate-200 dark:hover:border-slate-700 transition group"
      >
        <div className="flex items-center space-x-3 min-w-0 pr-2">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 text-[#165B33] dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-snug">
              What do you want to become?
            </h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-400 truncate mt-0.5">
              {becomingGoal.trim() || 'This will be entered by you while setting up.'}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition shrink-0" />
      </section>

      {/* CARD 2: PERSONAL INTEREST */}
      <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 text-[#165B33] dark:text-emerald-300 flex items-center justify-center">
              <Heart className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">
                Personal Interest
              </h2>
              <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                Curates daily wisdom quotes on your Home tab
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </div>

        {/* Preset Tags: built-in presets only */}
        <div className="pt-1">
          <div className="flex flex-wrap gap-2">
            {PRESET_INTERESTS.map((tag) => {
              const isSelected = selectedInterests.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-[#E8F8EE] dark:bg-emerald-950 text-[#165B33] dark:text-emerald-300 border-[#23C15D]/60 font-bold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {isSelected && <span className="mr-1 font-bold">✓</span>}
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* CARD 3: PROTECTION MODES */}
      <section
        data-tour="personal-protection"
        className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm space-y-3.5"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 text-[#165B33] dark:text-emerald-300 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">
              Protection Modes
            </h2>
            <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
              Pause momentum decay during exams and vacation
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1">
          <button
            type="button"
            onClick={onToggleExamShield}
            disabled={!examShieldActive && Boolean(examShieldStatus && !examShieldStatus.canEnable)}
            className={`py-3 px-3.5 rounded-2xl border text-left transition ${
              examShieldActive
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/90 border-[#23C15D] text-[#165B33] dark:text-emerald-300 shadow-sm ring-1 ring-[#23C15D] cursor-pointer active:scale-[0.99]'
                : examShieldStatus && !examShieldStatus.canEnable
                  ? 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.99]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <GraduationCap className={`w-4.5 h-4.5 ${examShieldActive ? 'text-[#165B33] dark:text-emerald-300' : 'text-slate-500'}`} />
                <span className="text-[13px] font-bold">Exam Shield</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  examShieldActive
                    ? 'bg-emerald-200/70 dark:bg-emerald-900/80 text-[#165B33] dark:text-emerald-200'
                    : 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400'
                }`}
              >
                {examShieldActive ? 'Active' : 'Off'}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <p>
                Days used: {examShieldStatus?.daysUsed ?? 0} / {examShieldStatus?.daysCap ?? 14}
                {examShieldActive ? ` · ${examShieldStatus?.daysRemaining ?? 0} left` : ''}
              </p>
              <p>
                Cooldown remaining:{' '}
                {examShieldStatus?.cooldownDaysRemaining
                  ? `${examShieldStatus.cooldownDaysRemaining} day${examShieldStatus.cooldownDaysRemaining === 1 ? '' : 's'}`
                  : 'None'}
              </p>
              <p>Window: {examShieldStatus?.windowLabel || 'Not scheduled'}</p>
              {examShieldStatus?.blockReason && !examShieldActive && (
                <p className="text-amber-700 dark:text-amber-300">{examShieldStatus.blockReason}</p>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={onToggleVacationMode}
            className={`py-3 px-3.5 rounded-2xl border text-left transition cursor-pointer active:scale-[0.99] ${
              vacationModeActive
                ? 'bg-[#E8F8EE] dark:bg-emerald-950/90 border-[#23C15D] text-[#165B33] dark:text-emerald-300 shadow-sm ring-1 ring-[#23C15D]'
                : 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plane className={`w-4.5 h-4.5 ${vacationModeActive ? 'text-[#165B33] dark:text-emerald-300' : 'text-slate-500'}`} />
                <span className="text-[13px] font-bold">Vacation</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  vacationModeActive
                    ? 'bg-emerald-200/70 dark:bg-emerald-900/80 text-[#165B33] dark:text-emerald-200'
                    : 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400'
                }`}
              >
                {vacationModeActive ? 'Active' : 'Off'}
              </span>
            </div>
            <div className="mt-2 space-y-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <p>
                Days used: {vacationStatus?.daysUsed ?? 0} / {vacationStatus?.daysCap ?? 5}
                {vacationModeActive ? ` · ${vacationStatus?.daysRemaining ?? 0} left` : ' · 5-day window'}
              </p>
              <p>Cooldown remaining: None</p>
              <p>Window: {vacationStatus?.windowLabel || 'Not scheduled'}</p>
            </div>
          </button>
        </div>

        {/* Protection Mode feedback */}
        {(examShieldActive || vacationModeActive) && (
          <div className="p-2.5 rounded-xl bg-[#E8F8EE]/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/50 text-[11.5px] text-[#165B33] dark:text-emerald-300 flex items-center space-x-2">
            <span className="shrink-0 font-bold">🛡️</span>
            <span>
              {examShieldActive && vacationModeActive
                ? 'Exam Shield & Vacation active: missed habits will not decay momentum (δ = 0).'
                : examShieldActive
                ? 'Exam Shield active: missed habits will not decay momentum (δ = 0).'
                : 'Vacation active: missed habits will not decay momentum (δ = 0).'}
            </span>
          </div>
        )}
      </section>

      {/* CARD 4: ADD A FRIEND */}
      <section
        data-tour="personal-friends"
        className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm flex items-center justify-between"
      >
        <div className="flex items-center space-x-3 min-w-0 pr-2">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 text-[#165B33] dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-snug">
              Add a Friend
            </h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-400 mt-0.5">
              Connect and grow together.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsFriendModalOpen(true)}
          className="w-10 h-10 rounded-full bg-[#E8F8EE] dark:bg-emerald-950 text-[#165B33] dark:text-emerald-300 flex items-center justify-center hover:scale-105 active:scale-95 transition cursor-pointer shrink-0 border border-emerald-100 dark:border-emerald-800/40 shadow-xs"
          title="Add a friend"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </section>

      {/* CARD 5: HELP & FEEDBACK */}
      <section
        onClick={() => setIsHelpModalOpen(true)}
        className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-slate-200 dark:hover:border-slate-700 transition group"
      >
        <div className="flex items-center space-x-3 min-w-0 pr-2">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-emerald-950/70 text-[#165B33] dark:text-emerald-300 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-snug">
              Help & Feedback
            </h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-400 mt-0.5">
              We&apos;re here to help.
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition shrink-0" />
      </section>

      {/* SECONDARY ACCOUNT & LEDGER OPTIONS */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-2 text-[12px]">
        {/* Ledger Link */}
        <button
          type="button"
          onClick={onOpenLedger}
          className="w-full py-2.5 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <div className="flex items-center space-x-2">
            <span>🏛️</span>
            <span>Identity Evidence Ledger</span>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 dark:text-blue-400">
            {totalLifetimeExecutions} votes →
          </span>
        </button>

        {/* Sync & Logout */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="flex-1 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium flex items-center justify-center space-x-1.5 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50 text-[11.5px]"
          >
            <span>{isSyncing ? 'Syncing...' : '↻ Sync Data'}</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:border-red-200 font-medium transition cursor-pointer text-[11.5px]"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. EDIT PERSONAL DETAILS MODAL */}
      {isEditDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
                Edit Personal Details
              </h3>
              <button
                type="button"
                onClick={() => setIsEditDetailsOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-3 text-[13px]">
              <div>
                <label className="block text-[11.5px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Date of Birth
                </label>
                <input
                  type="text"
                  value={tempDob}
                  onChange={(e) => setTempDob(e.target.value)}
                  placeholder="e.g. 12 Mar 2004"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  University / Organization
                </label>
                <input
                  type="text"
                  value={tempUniversity}
                  onChange={(e) => setTempUniversity(e.target.value)}
                  placeholder="e.g. SASTRA University"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={tempLocation}
                  onChange={(e) => setTempLocation(e.target.value)}
                  placeholder="e.g. India"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditDetailsOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. "WHAT DO YOU WANT TO BECOME?" MODAL */}
      {isBecomingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-emerald-600" />
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
                  What do you want to become?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBecomingModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBecoming} className="space-y-3 text-[13px]">
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Define the identity, masteries, or character you want your daily habits to shape.
              </p>
              <textarea
                rows={3}
                value={tempBecoming}
                onChange={(e) => setTempBecoming(e.target.value)}
                placeholder="e.g. I am a world-class engineer building high-impact tools with relentless discipline..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 text-[13px]"
              />

              <div className="pt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsBecomingModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Save Identity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isFriendModalOpen && (
        <FriendsFeed
          userId={userSession.id}
          isGuest={userSession.isGuest}
          userEmail={userSession.email}
          userName={name || userSession.name}
          variant="modal"
          onClose={() => setIsFriendModalOpen(false)}
        />
      )}

      {/* 4. HELP & FEEDBACK MODAL */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-[390px] bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
                  Help & Feedback
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-[12.5px]">
              {/* Quick FAQs */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Quick Guide
                </span>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                    <span>Priority Dots</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11.5px] leading-relaxed">
                    Green = High, Light Green = Mid, and Grey = Low priority. Visible only as a small dot beside the habit title.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-[#165B33] dark:text-emerald-300" />
                    <span>Exam Shield & Vacation</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11.5px] leading-relaxed">
                    Toggle Exam Shield (14 days/semester, 30-day cooldown) or a 5-day Vacation window to pause miss-decay.
                  </p>
                </div>
              </div>

              {/* Feedback form */}
              <form onSubmit={handleSendFeedback} className="space-y-2 pt-1">
                <label className="block text-[11.5px] font-bold text-slate-600 dark:text-slate-300">
                  Send Feedback or Feature Request
                </label>
                <textarea
                  rows={3}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  required
                  placeholder="Tell us what you'd like to improve or see added..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12px] outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={feedbackSent}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  {feedbackSent ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Feedback Sent!</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
