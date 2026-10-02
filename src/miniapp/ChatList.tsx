'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import type { ChatSummary } from '@/domain/types';
import { api, errorText } from './api';
import { avatarHue } from './avatarUtils';
import { IconChevron } from './icons';
import s from './miniapp.module.css';

export function ChatList({ onOpen }: { onOpen: (chatId: number) => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ chats: ChatSummary[] }>('/api/app/chats').then((d) => setChats(d.chats)).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <>
      <h1 className={s.pageTitle}>Доски</h1>
      {error ? (
        <div className={s.center}>{error}</div>
      ) : !chats ? (
        <div className={s.skeletons}>{[0, 1, 2].map((i) => <div key={i} className={s.skel} style={{ height: 64 }} />)}</div>
      ) : chats.length === 0 ? (
        <div className={s.center}>Здесь появятся группы, где есть вы и бот. Добавьте бота в группу и попросите админа её подключить.</div>
      ) : (
        <div className={s.list}>
          {chats.map((c) => {
            const title = c.title || 'Без названия';
            return (
              <button key={c.id} className={s.listItem} onClick={() => onOpen(c.id)}>
                <span className={s.tile} style={{ '--h': avatarHue(title) } as CSSProperties}>{Array.from(title)[0].toUpperCase()}</span>
                <span className={s.listTitle}>{title}</span>
                <span className={s.listChevron}><IconChevron size={18} /></span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
