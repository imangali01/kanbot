'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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

const STATUS_LABEL = { pending: 'ожидает', enabled: 'включён', disabled: 'отключён' } as const;

export default function AdminPage() {
  const router = useRouter();
  const [chats, setChats] = useState<AdminChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/chats');
    if (res.status === 401) return router.replace('/admin/login');
    const data = (await res.json()) as { chats?: AdminChat[]; error?: string };
    if (!res.ok) return setError(data.error ?? 'Ошибка');
    setChats(data.chats ?? []);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function patch(id: number, body: Partial<Pick<AdminChat, 'status' | 'creatorsMode' | 'creatorIds'>>) {
    const res = await fetch(`/api/admin/chats/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Ошибка');
    await load();
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  }

  return (
    <main className={s.page}>
      <div className={s.top}>
        <h1 className={s.title}>Чаты</h1>
        <button className={s.btn} onClick={() => void logout()}>Выйти</button>
      </div>
      {error && <p className={s.error}>{error}</p>}
      {!chats ? <p className={s.hint}>Загрузка…</p> : chats.length === 0 ? (
        <p className={s.hint}>Пока нет чатов. Добавьте бота в группу — она появится здесь.</p>
      ) : chats.map((c) => (
        <section key={c.id} className={s.chat}>
          <div className={s.chatHead}>
            <strong>{c.title || 'Без названия'}</strong>
            <span className={c.status === 'enabled' ? s.badgeOn : s.badge}>{STATUS_LABEL[c.status]}</span>
            {c.status === 'enabled'
              ? <button className={s.btn} onClick={() => void patch(c.id, { status: 'disabled' })}>Отключить</button>
              : <button className={s.btnPrimary} onClick={() => void patch(c.id, { status: 'enabled' })}>Включить</button>}
          </div>
          <div className={s.row}>
            <span>Ставить задачи могут:</span>
            <label><input type="radio" checked={c.creatorsMode === 'all'} onChange={() => void patch(c.id, { creatorsMode: 'all' })} /> все</label>
            <label><input type="radio" checked={c.creatorsMode === 'list'} onChange={() => void patch(c.id, { creatorsMode: 'list' })} /> выбранные</label>
          </div>
          {c.creatorsMode === 'list' && (
            <div className={s.members}>
              {c.members.length === 0 && <span className={s.hint}>Бот ещё не видел участников — пусть они напишут в группу.</span>}
              {c.members.map((m) => (
                <label key={m.userId}>
                  <input
                    type="checkbox"
                    checked={c.creatorIds.includes(m.userId)}
                    onChange={(e) => void patch(c.id, { creatorIds: e.target.checked ? [...c.creatorIds, m.userId] : c.creatorIds.filter((id) => id !== m.userId) })}
                  /> {m.name}
                </label>
              ))}
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
