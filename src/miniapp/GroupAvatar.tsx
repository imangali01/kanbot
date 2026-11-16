'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { avatarHue } from './avatarUtils';
import { webApp } from './telegram';
import s from './miniapp.module.css';

// фото группы за сессию грузим один раз: null — у группы нет фото
const cache = new Map<number, string | null>();

/** Аватарка группы из Telegram; пока грузится или если фото нет — цветная плитка с первой буквой названия. */
export function GroupAvatar({ chatId, title, size = 44 }: { chatId: number; title: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(cache.get(chatId) ?? null);

  useEffect(() => {
    if (cache.has(chatId)) return;
    let alive = true;
    fetch(`/api/app/chats/${chatId}/photo`, { headers: { Authorization: `tma ${webApp()?.initData ?? ''}` } })
      .then(async (res) => {
        const url = res.ok ? URL.createObjectURL(await res.blob()) : null;
        cache.set(chatId, url);
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [chatId]);

  const box = { width: size, height: size, borderRadius: Math.round(size * 0.32), fontSize: Math.round(size * 0.41) } as CSSProperties;
  if (src) {
    return (
      <span className={s.tile} style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.tileImg} src={src} alt="" />
      </span>
    );
  }
  return <span className={s.tile} style={{ ...box, '--h': avatarHue(title) } as CSSProperties}>{Array.from(title)[0].toUpperCase()}</span>;
}
