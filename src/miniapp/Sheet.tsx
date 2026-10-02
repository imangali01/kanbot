'use client';
import { useEffect, type ReactNode } from 'react';
import s from './miniapp.module.css';

export function Sheet({ onClose, children, footer, label }: { onClose: () => void; children: ReactNode; footer?: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <>
      <div className={s.backdrop} onClick={onClose} />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={label}>
        <div className={s.handle} />
        <div className={s.sheetBody}>{children}</div>
        {footer && <div className={s.sheetFoot}>{footer}</div>}
      </div>
    </>
  );
}
