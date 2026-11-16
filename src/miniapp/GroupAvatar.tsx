'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { avatarHue } from './avatarUtils';
import { webApp } from './telegram';
import s from './miniapp.module.css';

// фото группы за сессию грузим один раз: null — у группы нет фото
const cache = new Map<string, string | null>();

/** Аватарка группы из Telegram; пока грузится или если фото нет — цветная плитка с первой буквой названия. */
export function GroupAvatar({ chatId, title, size = 44, admin = false }: { chatId: number; title: string; size?: number; admin?: boolean }) {
  const path = admin ? `/api/admin/chats/${chatId}/photo` : `/api/app/chats/${chatId}/photo`;
  const [src, setSrc] = useState<string | null>(cache.get(path) ?? null);

  useEffect(() => {
    if (cache.has(path)) return;
    let alive = true;
    // в Mini App вход по данным Telegram, на сайте админки — по cookie (заголовок тогда не нужен)
    const initData = webApp()?.initData;
    fetch(path, { headers: initData ? { Authorization: `tma ${initData}` } : {} })
      .then(async (res) => {
        const url = res.ok ? URL.createObjectURL(await res.blob()) : null;
        cache.set(path, url);
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [path]);

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
