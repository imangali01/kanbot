'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Avatar } from '@/miniapp/Avatar';
import { avatarHue } from '@/miniapp/avatarUtils';
import s from './admin.module.css';

interface AdminChat {
  id: number;
  title: string;
  type: string;
  status: 'pending' | 'enabled' | 'disabled';
  creatorsMode: 'all' | 'list';
  creatorIds: number[];
  members: { userId: number; name: string }[];
}

const STATUS_LABEL = { pending: 'Ждёт включения', enabled: 'Работает', disabled: 'Отключён' } as const;
const dotClass = { pending: s.dot_pending, enabled: s.dot_enabled, disabled: s.dot_disabled } as const;

export default function AdminPage() {
  const router = useRouter();
  const [chats, setChats] = useState<AdminChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/chats');
    if (res.status === 401) return router.replace('/admin/login');
    const data = (await res.json()) as { chats?: AdminChat[]; error?: string };
    if (!res.ok) return setError(data.error ?? 'Не удалось загрузить чаты');
    setError(null);
    setChats(data.chats ?? []);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function patch(id: number, body: Partial<Pick<AdminChat, 'status' | 'creatorsMode' | 'creatorIds'>>) {
    const res = await fetch(`/api/admin/chats/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Не удалось сохранить');
    await load();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className={s.page}>
      <div className={s.wrap}>
        <div className={s.top}>
          <h1 className={s.title}>Чаты</h1>
          <button className={s.btnSmall} onClick={() => void logout()}>Выйти</button>
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
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
