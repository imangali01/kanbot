'use client';
import { useCallback, useEffect, useState } from 'react';
import { parseStartParam } from '@/domain/links';
import { Board } from './Board';
import { ChatList } from './ChatList';
import { webApp } from './telegram';
import s from './miniapp.module.css';

type View = { kind: 'chats' } | { kind: 'board'; chatId: number; taskNumber: number | null };

export function MiniApp() {
  const [view, setView] = useState<View | null>(null);
  const [inTelegram, setInTelegram] = useState(true);

  useEffect(() => {
    const wa = webApp();
    setInTelegram(!!wa?.initData);
    wa?.ready();
    wa?.expand();
    wa?.disableVerticalSwipes?.();
    const start = parseStartParam(wa?.initDataUnsafe.start_param);
    setView(start ? { kind: 'board', chatId: start.chatId, taskNumber: start.taskNumber } : { kind: 'chats' });
  }, []);

  const toChats = useCallback(() => {
    webApp()?.BackButton.hide();
    setView({ kind: 'chats' });
  }, []);

  if (!view) return null;
  return (
    <div className={s.app}>
      {!inTelegram ? (
        <div className={s.center}>Откройте доску из Telegram</div>
      ) : view.kind === 'chats' ? (
        <ChatList onOpen={(chatId) => setView({ kind: 'board', chatId, taskNumber: null })} />
      ) : (
        <Board chatId={view.chatId} openTaskNumber={view.taskNumber} onBack={toChats} />
      )}
    </div>
  );
}
