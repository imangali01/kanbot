'use client';
import { useCallback, useEffect, useState } from 'react';
import { AdminChats, type AdminCall } from '@/admin/AdminChats';
import { parseStartParam } from '@/domain/links';
import { rawApi } from './api';
import { Board } from './Board';
import { ChatList } from './ChatList';
import { applyTheme, webApp } from './telegram';
import s from './miniapp.module.css';

type View = { kind: 'chats' } | { kind: 'admin' } | { kind: 'board'; chatId: number; taskNumber: number | null };

const adminCall: AdminCall = (path, init) => rawApi(path, init);

export function MiniApp() {
  const [view, setView] = useState<View | null>(null);
  const [inTelegram, setInTelegram] = useState(true);

  useEffect(() => {
    const wa = webApp();
    setInTelegram(!!wa?.initData);
    wa?.ready();
    wa?.expand();
    wa?.disableVerticalSwipes?.();
    const sync = () => applyTheme(wa);
    sync();
    wa?.onEvent?.('themeChanged', sync);
    const start = parseStartParam(wa?.initDataUnsafe.start_param);
    setView(start ? { kind: 'board', chatId: start.chatId, taskNumber: start.taskNumber } : { kind: 'chats' });
    return () => wa?.offEvent?.('themeChanged', sync);
  }, []);

  const toChats = useCallback(() => {
    webApp()?.BackButton.hide();
    setView({ kind: 'chats' });
  }, []);

  if (!view) return null;
  return (
    <div className={s.app}>
      {!inTelegram ? (
        <div className={s.center}>Откройте доску из Telegram: нажмите «Открыть доску» под сообщением бота в группе.</div>
      ) : view.kind === 'chats' ? (
        <ChatList onOpen={(chatId) => setView({ kind: 'board', chatId, taskNumber: null })} onAdmin={() => setView({ kind: 'admin' })} />
      ) : view.kind === 'admin' ? (
        <AdminChats call={adminCall} onBack={toChats} />
      ) : (
        <Board chatId={view.chatId} openTaskNumber={view.taskNumber} onBack={toChats} />
      )}
    </div>
  );
}
