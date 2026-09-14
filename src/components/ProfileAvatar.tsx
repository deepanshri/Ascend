import React from 'react';
import { avatarSrc } from '../data/avatars';

const WRAPPER_BASE =
  'relative inline-flex items-center justify-center overflow-hidden aspect-square shrink-0 bg-emerald-50 dark:bg-blue-950/60';
const IMAGE_BASE = 'block h-full w-full max-h-full max-w-full object-contain object-center';

interface ProfileAvatarProps {
  value?: string | null;
  src?: string;
  alt?: string;
  className?: string;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  value,
  src,
  alt = 'Profile avatar',
  className = 'w-12 h-12 rounded-xl',
}) => {
  return (
    <span className={`${WRAPPER_BASE} ${className}`}>
      <img src={src || avatarSrc(value)} alt={alt} draggable={false} className={IMAGE_BASE} />
    </span>
  );
};
