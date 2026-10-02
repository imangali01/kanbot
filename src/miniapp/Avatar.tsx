import type { CSSProperties } from 'react';
import { avatarHue, initials } from './avatarUtils';
import s from './miniapp.module.css';

export function Avatar({ name, size = 22, stacked = false }: { name: string; size?: number; stacked?: boolean }) {
  const style = { '--h': avatarHue(name), width: size, height: size, fontSize: Math.round(size * 0.42) } as CSSProperties;
  return (
    <span className={stacked ? s.avatarStacked : s.avatar} style={style} title={name}>
      {initials(name)}
    </span>
  );
}
