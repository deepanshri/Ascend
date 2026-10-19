import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FEEDBACK_MAX_LENGTH, type FeedbackReport } from './feedbackSync';

function newReportId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Old WebViews: random v4 UUID by hand.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Installed version as "1.0.5 (6)" on Android/iOS; null on the web build, which has no install. */
async function appVersion(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const info = await App.getInfo();
    return `${info.version} (${info.build})`.slice(0, 64);
  } catch {
    return null;
  }
}

function platform(): FeedbackReport['platform'] {
  const value = Capacitor.getPlatform();
  return value === 'android' || value === 'ios' || value === 'web' ? value : null;
}

function userAgent(): string | null {
  try {
    return typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 512) || null;
  } catch {
    return null;
  }
}

/** A report for `message` with what's needed to act on it: version, platform, OS/device (user agent). */
export async function buildFeedbackReport(message: string): Promise<FeedbackReport> {
  return {
    id: newReportId(),
    message: message.trim().slice(0, FEEDBACK_MAX_LENGTH),
    createdAt: new Date().toISOString(),
    appVersion: await appVersion(),
    platform: platform(),
    userAgent: userAgent(),
  };
}
