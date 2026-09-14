import React from 'react';
import { avatarSrc } from '../data/avatars';

interface ProfileAvatarProps {
  value?: string | null;
  alt?: string;
  className?: string;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  value,
  alt = 'Profile avatar',
  className = 'w-10 h-10 rounded-xl',
}) => {
  return (
    <img
      src={avatarSrc(value)}
      alt={alt}
      draggable={false}
      className={`object-cover bg-emerald-50 dark:bg-blue-950/60 shrink-0 ${className}`}
    />
  );
};
