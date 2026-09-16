import { useEffect, useState } from 'react';
import { measureKeyboardInset } from './useKeyboardInset';

function isTextEntryElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
    const input = target as HTMLInputElement;
    if (input.type === 'button' || input.type === 'submit' || input.type === 'checkbox' || input.type === 'radio') {
      return false;
    }
    return true;
  }
  return target.isContentEditable;
}

function hasOpenAscendModal(): boolean {
  return Boolean(document.querySelector('[data-ascend-modal="true"]'));
}

/** True when the soft keyboard is up or a text field is focused. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const insetOpen = measureKeyboardInset() > 0;
      const focusOpen = isTextEntryElement(document.activeElement);
      setVisible(insetOpen || focusOpen);
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    // focusout fires before the next field focuses — recheck after paint
    const onFocusOut = () => {
      window.setTimeout(update, 0);
    };
    document.addEventListener('focusout', onFocusOut);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return visible;
}

/** True when any Ascend MotionModal overlay is mounted. */
export function useAnyModalOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const update = () => setOpen(hasOpenAscendModal());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-ascend-modal'],
    });
    return () => observer.disconnect();
  }, []);

  return open;
}
