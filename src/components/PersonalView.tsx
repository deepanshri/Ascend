import React, { useState, useEffect, useRef } from 'react';
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
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { IdentityEvidence, UserSession } from '../types';
import { FriendsFeed } from './FriendsFeed';
import { MotionModal } from './MotionModal';
import { ProfileAvatar } from './ProfileAvatar';
import { overlayFade, tapPress } from '../lib/motionPresets';
import { ScreenHeader, SCREEN_INSET_CLASS } from './ScreenHeader';
import { persistUserProfile } from '../lib/profile';
import { AVATAR_OPTIONS, persistStoredAvatarId, readStoredAvatarId, resolveAvatarId } from '../data/avatars';
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
  onUpdateAvatar?: (avatarId: string) => void;
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
  onOpenSettings,
  onOpenLedger,
  onUpgradeGuest,
  onSyncNow,
  onChangePassword,
  onLogout,
  onUpdateName,
  onUpdateAvatar,
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

  const selectedInterests = Array.isArray(propSelectedInterests)
    ? propSelectedInterests
    : Array.isArray(localSelectedInterests)
      ? localSelectedInterests
      : [];
  const evidenceItems = Array.isArray(evidenceList) ? evidenceList : [];

  // "What do you want to become?" aspiration state
  const [becomingGoal, setBecomingGoal] = useState<string>(() => {
    return localStorage.getItem('ascend_becoming_goal') || '';
  });

  // Modals state
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [isBecomingModalOpen, setIsBecomingModalOpen] = useState(false);
  const [isFriendModalOpen, setIsFriendModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAvatarSheetOpen, setIsAvatarSheetOpen] = useState(false);
  const [avatarId, setAvatarId] = useState(() => readStoredAvatarId(userSession.avatarUrl));

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
  const [isSyncing, setIsSyncing] = useState(false);

  // Persist interests
  useEffect(() => {
    try {
      localStorage.setItem('ascend_personal_interests', JSON.stringify(selectedInterests));
    } catch {}
  }, [selectedInterests]);
  const feedbackTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

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
  };

  const handleSaveBecoming = (e: React.FormEvent) => {
    e.preventDefault();
    setBecomingGoal(tempBecoming);
    localStorage.setItem('ascend_becoming_goal', tempBecoming);
    setIsBecomingModalOpen(false);
  };

  const handleSelectAvatar = (id: string) => {
    const next = resolveAvatarId(id);
    setAvatarId(next);
    persistStoredAvatarId(next);
    onUpdateAvatar?.(next);
    void persistUserProfile(userSession, { avatar_url: next });
    setIsAvatarSheetOpen(false);
  };

  useEffect(() => {
    if (userSession.avatarUrl) setAvatarId(resolveAvatarId(userSession.avatarUrl));
  }, [userSession.avatarUrl]);

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
    if (feedbackTimerRef.current != null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setFeedbackSent(false);
      setFeedbackText('');
      setIsHelpModalOpen(false);
    }, 1000);
  };

  const handleSyncClick = async () => {
    setIsSyncing(true);
    try {
      await onSyncNow();
    } catch {
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  };

  const totalLifetimeExecutions = identityVoteCount ?? evidenceItems.length;

  return (
    <div
      id="personal-screen"
      onScroll={onScroll}
      className={`absolute inset-0 px-4 ${SCREEN_INSET_CLASS} pb-24 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none`}
    >
      <ScreenHeader
        title="Personal"
        subtitle="Your space. Your growth."
        onOpenSettings={onOpenSettings}
      />

      {/* CARD 1: PERSONAL DETAILS */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <ProfileAvatar value={avatarId} alt="Your profile avatar" className="w-16 h-16 rounded-2xl" />
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">Personal Details</h2>
              <motion.button
                type="button"
                whileTap={tapPress}
                onClick={() => setIsAvatarSheetOpen(true)}
                className="mt-1 text-[12px] font-bold text-[#22C55E] dark:text-[#3B82F6] cursor-pointer"
              >
                Edit Avatar
              </motion.button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setTempName(name);
              setTempDob(dob);
              setTempUniversity(university);
              setTempLocation(location);
              setIsEditDetailsOpen(true);
            }}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Edit personal details"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
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
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/70 text-[#165B33] dark:text-blue-300 flex items-center justify-center shrink-0">
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
            <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/70 text-[#165B33] dark:text-blue-300 flex items-center justify-center">
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
                  className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium border transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-[#E8F8EE] dark:bg-blue-950 text-[#165B33] dark:text-blue-300 border-[#23C15D]/60 dark:border-blue-500/60 font-bold shadow-xs'
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
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/70 text-[#165B33] dark:text-blue-300 flex items-center justify-center">
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
                ? 'bg-[#E8F8EE] dark:bg-blue-950/90 border-[#23C15D] dark:border-blue-500 text-[#165B33] dark:text-blue-300 shadow-sm ring-1 ring-[#23C15D] dark:ring-blue-500 cursor-pointer active:scale-[0.99]'
                : examShieldStatus && !examShieldStatus.canEnable
                  ? 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.99]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <GraduationCap className={`w-4.5 h-4.5 ${examShieldActive ? 'text-[#165B33] dark:text-blue-300' : 'text-slate-500'}`} />
                <span className="text-[13px] font-bold">Exam Shield</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  examShieldActive
                    ? 'bg-emerald-200/70 dark:bg-blue-900/80 text-[#165B33] dark:text-blue-200'
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
                ? 'bg-[#E8F8EE] dark:bg-blue-950/90 border-[#23C15D] dark:border-blue-500 text-[#165B33] dark:text-blue-300 shadow-sm ring-1 ring-[#23C15D] dark:ring-blue-500'
                : 'bg-slate-50/90 dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plane className={`w-4.5 h-4.5 ${vacationModeActive ? 'text-[#165B33] dark:text-blue-300' : 'text-slate-500'}`} />
                <span className="text-[13px] font-bold">Vacation</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  vacationModeActive
                    ? 'bg-emerald-200/70 dark:bg-blue-900/80 text-[#165B33] dark:text-blue-200'
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
          <div className="p-2.5 rounded-xl bg-[#E8F8EE]/70 dark:bg-blue-950/40 border border-emerald-200/60 dark:border-blue-800/50 text-[11.5px] text-[#165B33] dark:text-blue-300 flex items-center space-x-2">
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

      {/* CARD 4: FRIENDS */}
      <section
        data-tour="personal-friends"
        className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-100/90 dark:border-slate-800 shadow-sm flex items-center justify-between"
      >
        <div className="flex items-center space-x-3 min-w-0 pr-2">
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/70 text-[#165B33] dark:text-blue-300 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-snug">
              Friends
            </h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-400 mt-0.5">
              Share your code or send an invite — they must Accept.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsFriendModalOpen(true)}
          className="w-10 h-10 rounded-full bg-[#E8F8EE] dark:bg-blue-950 text-[#165B33] dark:text-blue-300 flex items-center justify-center hover:scale-105 active:scale-95 transition cursor-pointer shrink-0 border border-emerald-100 dark:border-blue-800/40 shadow-xs"
          title="Open friends"
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
          <div className="w-10 h-10 rounded-2xl bg-[#E8F8EE] dark:bg-blue-950/70 text-[#165B33] dark:text-blue-300 flex items-center justify-center shrink-0">
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
      <MotionModal
        isOpen={isEditDetailsOpen}
        onClose={() => setIsEditDetailsOpen(false)}
        overlayClassName="bg-slate-900/40 backdrop-blur-xs"
        cardClassName="p-5 space-y-4"
      >
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 dark:focus:border-blue-500"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 dark:focus:border-blue-500"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 dark:focus:border-blue-500"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 dark:focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex space-x-2">
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={() => setIsEditDetailsOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={tapPress}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  Save Changes
                </motion.button>
              </div>
            </form>
      </MotionModal>

      {/* 2. "WHAT DO YOU WANT TO BECOME?" MODAL */}
      <MotionModal
        isOpen={isBecomingModalOpen}
        onClose={() => setIsBecomingModalOpen(false)}
        overlayClassName="bg-slate-900/40 backdrop-blur-xs"
        cardClassName="p-5 space-y-4"
      >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <Target className="w-5 h-5 text-emerald-600 dark:text-blue-400" />
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
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium outline-none focus:border-emerald-500 dark:focus:border-blue-500 text-[13px]"
              />

              <div className="pt-2 flex space-x-2">
                <motion.button
                  type="button"
                  whileTap={tapPress}
                  onClick={() => setIsBecomingModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="submit"
                  whileTap={tapPress}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold cursor-pointer"
                >
                  Save Identity
                </motion.button>
              </div>
            </form>
      </MotionModal>

      <FriendsFeed
        userId={userSession.id}
        isGuest={userSession.isGuest}
        userEmail={userSession.email}
        userName={name || userSession.name}
        variant="modal"
        mode="invite"
        isOpen={isFriendModalOpen}
        onClose={() => setIsFriendModalOpen(false)}
      />

      {/* 4. HELP & FEEDBACK MODAL */}
      <MotionModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        overlayClassName="bg-slate-900/40 backdrop-blur-xs"
        cardClassName="p-5 space-y-4"
      >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-emerald-600 dark:text-blue-400" />
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
                    <span className="w-2 h-2 rounded-full bg-[#16a34a] dark:bg-blue-500" />
                    <span>Priority Dots</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11.5px] leading-relaxed">
                    High / Mid / Low priority show as a small accent dot beside the habit title (green in light mode, blue in dark mode).
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-[#165B33] dark:text-blue-300" />
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-[12px] outline-none focus:border-emerald-500 dark:focus:border-blue-500"
                />
                <motion.button
                  type="submit"
                  whileTap={feedbackSent ? undefined : tapPress}
                  disabled={feedbackSent}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold flex items-center justify-center space-x-2 cursor-pointer"
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
                </motion.button>
              </form>
            </div>
      </MotionModal>

      {createPortal(
        <AnimatePresence>
          {isAvatarSheetOpen && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 backdrop-blur-xs transform-gpu"
              initial={overlayFade.initial}
              animate={overlayFade.animate}
              exit={overlayFade.exit}
              transition={overlayFade.transition}
              onClick={() => setIsAvatarSheetOpen(false)}
              role="presentation"
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="avatar-sheet-title"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={(event) => event.stopPropagation()}
                className="w-full max-w-lg rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 id="avatar-sheet-title" className="text-[16px] font-bold text-slate-900 dark:text-white">
                    Choose Avatar
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAvatarSheetOpen(false)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="Close avatar picker"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto overscroll-contain pb-28">
                  <div className="grid grid-cols-4 gap-3">
                    {AVATAR_OPTIONS.map((option) => {
                      const selected = option.id === avatarId;
                      return (
                        <motion.button
                          key={option.id}
                          type="button"
                          whileTap={tapPress}
                          onClick={() => handleSelectAvatar(option.id)}
                          aria-pressed={selected}
                          aria-label={option.label}
                          className={`aspect-square w-full p-1 rounded-2xl cursor-pointer ${
                            selected
                              ? 'ring-2 ring-green-500 dark:ring-blue-500'
                              : 'ring-1 ring-transparent hover:ring-slate-200 dark:hover:ring-slate-700'
                          }`}
                        >
                          <ProfileAvatar
                            value={option.id}
                            src={option.src}
                            alt=""
                            className="flex h-full w-full rounded-xl"
                          />
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
