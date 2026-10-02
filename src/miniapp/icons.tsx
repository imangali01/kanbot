import type { ReactNode } from 'react';

function Icon({ size = 20, children, fill = 'none' }: { size?: number; children: ReactNode; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconRefresh = (p: P) => (
  <Icon {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></Icon>
);
export const IconSliders = (p: P) => (
  <Icon {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
);
export const IconChevron = (p: P) => (
  <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>
);
export const IconCalendar = (p: P) => (
  <Icon {...p}><rect x="4" y="5.5" width="16" height="14" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Icon>
);
export const IconUsers = (p: P) => (
  <Icon {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-4.8 5.5-4.8s4.9 1.6 5.5 4.8" /><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.6c1.7.5 2.8 1.9 3.2 4.4" /></Icon>
);
export const IconUser = (p: P) => (
  <Icon {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.7-3.6 3.2-5.5 7-5.5s6.3 1.9 7 5.5" /></Icon>
);
export const IconStar = ({ size = 20, filled = false }: P & { filled?: boolean }) => (
  <Icon size={size} fill={filled ? 'currentColor' : 'none'}><path d="M12 3.8l2.5 5.3 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></Icon>
);
export const IconTrash = (p: P) => (
  <Icon {...p}><path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12h8.4L17 7M10 11v5M14 11v5" /></Icon>
);
export const IconSend = (p: P) => (
  <Icon {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
);
export const IconArchive = (p: P) => (
  <Icon {...p}><rect x="3.5" y="5" width="17" height="4.5" rx="1.5" /><path d="M5.5 9.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5M10 13.5h4" /></Icon>
);
export const IconShield = (p: P) => (
  <Icon {...p}><path d="M12 3.5l7 2.6v5.4c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6.1z" /><path d="M9 12l2.2 2.2L15.2 10" /></Icon>
);
export const IconLock = (p: P) => (
  <Icon {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Icon>
);
export const IconMore = (p: P) => (
  <Icon {...p}><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></Icon>
);
export const IconChevronDown = (p: P) => (
  <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
);
export const IconReply = (p: P) => (
  <Icon {...p}><path d="M10 6.5L4.5 12 10 17.5" /><path d="M4.5 12h9a6 6 0 0 1 6 6v.5" /></Icon>
);
