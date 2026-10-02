'use client';
import { useEffect, useState } from 'react';
import type { ChatSummary } from '@/domain/types';
import { api, errorText } from './api';
import s from './miniapp.module.css';

export function ChatList({ onOpen }: { onOpen: (chatId: number) => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ chats: ChatSummary[] }>('/api/app/chats').then((d) => setChats(d.chats)).catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <div className={s.center}>{error}</div>;
  if (!chats) return <div className={s.center}>Загрузка…</div>;
  if (chats.length === 0) return <div className={s.center}>Нет досок. Добавьте бота в группу и попросите админа подключить её.</div>;
  return (
    <div className={s.list}>
      {chats.map((c) => (
        <button key={c.id} className={s.listItem} onClick={() => onOpen(c.id)}>{c.title || 'Без названия'}</button>
      ))}
    </div>
  );
}
