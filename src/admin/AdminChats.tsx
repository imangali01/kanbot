'use client';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import s from '@/app/admin/admin.module.css';
import { Avatar } from '@/miniapp/Avatar';
import { DISPLAY_NAME_MAX } from '@/domain/displayName';
import { avatarHue } from '@/miniapp/avatarUtils';
import { webApp } from '@/miniapp/telegram';

export interface AdminChat {
  id: number;
  title: string;
  type: string;
  status: 'pending' | 'enabled' | 'disabled';
  creatorsMode: 'all' | 'list';
  creatorIds: number[];
  members: { userId: number; name: string; custom: boolean }[];
}

function MemberName({ member, onSave }: { member: AdminChat['members'][number]; onSave: (userId: number, displayName: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.name);
  const submit = async (next: string) => {
    await onSave(member.userId, next);
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className={s.memberRow}>
        <Avatar name={member.name} size={24} />
        <span className={s.memberName}>{member.name}{member.custom && <span className={s.memberTag}>своё имя</span>}</span>
        <button className={s.btnSmall} onClick={() => { setValue(member.name); setEditing(true); }}>Изменить</button>
      </div>
    );
  }
  return (
    <div className={s.memberRow}>
      <input className={s.memberInput} value={value} maxLength={DISPLAY_NAME_MAX} autoFocus aria-label="Имя участника" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(value); if (e.key === 'Escape') setEditing(false); }} />
      <button className={s.btnSmallPrimary} onClick={() => void submit(value)}>Сохранить</button>
      {member.custom && <button className={s.btnSmall} title="Вернуть имя из Telegram" onClick={() => void submit('')}>Сбросить</button>}
      <button className={s.btnSmall} onClick={() => setEditing(false)}>Отмена</button>
    </div>
  );
}

export type AdminCall = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; data: { chats?: AdminChat[]; error?: string } }>;

const STATUS_LABEL = { pending: 'Ждёт включения', enabled: 'Работает', disabled: 'Отключён' } as const;
const dotClass = { pending: s.dot_pending, enabled: s.dot_enabled, disabled: s.dot_disabled } as const;

/**
 * Панель чатов. На сайте работает по cookie (есть «Выйти»),
 * в Mini App — по данным Telegram (есть «Назад», вход не нужен).
 */
export function AdminChats({ call, onUnauthorized, onLogout, onBack }: { call: AdminCall; onUnauthorized?: () => void; onLogout?: () => void; onBack?: () => void }) {
  const [chats, setChats] = useState<AdminChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const embedded = !!onBack;

  const load = useCallback(async () => {
    const { status, data } = await call('/api/admin/chats');
    if (status === 401 && onUnauthorized) return onUnauthorized();
    if (status >= 400) return setError(data.error ?? 'Не удалось загрузить чаты');
    setError(null);
    setChats(data.chats ?? []);
  }, [call, onUnauthorized]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!onBack) return;
    const back = webApp()?.BackButton;
    back?.show();
    back?.onClick(onBack);
    return () => back?.offClick(onBack);
  }, [onBack]);

  async function patch(id: number, body: Partial<Pick<AdminChat, 'status' | 'creatorsMode' | 'creatorIds'>>) {
    const { status, data } = await call(`/api/admin/chats/${id}`, { method: 'PATCH', body });
    if (status >= 400) setError(data.error ?? 'Не удалось сохранить');
    await load();
  }

  async function rename(userId: number, displayName: string) {
    const { status, data } = await call(`/api/admin/users/${userId}`, { method: 'PATCH', body: { displayName } });
    if (status >= 400) setError(data.error ?? 'Не удалось сохранить имя');
    await load();
  }

  return (
    <main className={s.page}>
      <div className={embedded ? s.wrapEmbedded : s.wrap}>
        <div className={s.top}>
          <h1 className={embedded ? s.titleEmbedded : s.title}>Чаты</h1>
          {onLogout && <button className={s.btnSmall} onClick={onLogout}>Выйти</button>}
        </div>
        {error && <p className={s.error} role="alert">{error}</p>}
        {!chats ? (
          <div className={s.chats}>{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>
        ) : chats.length === 0 ? (
          <div className={s.empty}>Пока нет ни одного чата.<br />Добавьте бота в группу и напишите там любое сообщение, и группа появится здесь.</div>
        ) : (
          <div className={s.chats}>
            {chats.map((c) => {
              const title = c.title || 'Без названия';
              return (
                <section key={c.id} className={s.chat}>
                  <div className={s.chatHead}>
                    <span className={s.tile} style={{ '--h': avatarHue(title) } as CSSProperties}>{Array.from(title)[0].toUpperCase()}</span>
                    <div className={s.chatInfo}>
                      <div className={s.chatTitle}>{title}</div>
                      <div className={s.status}><span className={dotClass[c.status]} />{STATUS_LABEL[c.status]}</div>
                    </div>
                    {c.status === 'enabled'
                      ? <button className={s.btnSmall} onClick={() => void patch(c.id, { status: 'disabled' })}>Отключить</button>
                      : <button className={s.btnSmallPrimary} onClick={() => void patch(c.id, { status: 'enabled' })}>Включить</button>}
                  </div>

                  <div className={s.who}>
                    <div className={s.whoLabel}>Кто может ставить задачи</div>
                    <div className={s.seg} role="radiogroup" aria-label="Кто может ставить задачи">
                      <button role="radio" aria-checked={c.creatorsMode === 'all'} className={c.creatorsMode === 'all' ? s.segOn : s.segBtn} onClick={() => void patch(c.id, { creatorsMode: 'all' })}>Все участники</button>
                      <button role="radio" aria-checked={c.creatorsMode === 'list'} className={c.creatorsMode === 'list' ? s.segOn : s.segBtn} onClick={() => void patch(c.id, { creatorsMode: 'list' })}>Выбранные</button>
                    </div>
                    {c.creatorsMode === 'list' && (
                      <div className={s.members}>
                        {c.members.length === 0 && <p className={s.hint}>Бот ещё не видел участников. Пусть они напишут что-нибудь в группе.</p>}
                        {c.members.map((m) => {
                          const on = c.creatorIds.includes(m.userId);
                          return (
                            <button key={m.userId} className={on ? s.pillOn : s.pill} aria-pressed={on} onClick={() => void patch(c.id, { creatorIds: on ? c.creatorIds.filter((id) => id !== m.userId) : [...c.creatorIds, m.userId] })}>
                              <Avatar name={m.name} size={24} />
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {c.members.length > 0 && (
                    <div className={s.who}>
                      <div className={s.whoLabel}>Участники и их имена</div>
                      {c.members.map((m) => <MemberName key={`${m.userId}:${m.name}`} member={m} onSave={rename} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
