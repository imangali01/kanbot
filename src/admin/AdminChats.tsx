'use client';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import s from '@/app/admin/admin.module.css';
import { DISPLAY_NAME_MAX } from '@/domain/displayName';
import { Avatar } from '@/miniapp/Avatar';
import { avatarHue } from '@/miniapp/avatarUtils';
import { IconChevronDown } from '@/miniapp/icons';
import { webApp } from '@/miniapp/telegram';

export interface AdminMember { userId: number; name: string; custom: boolean }

export interface AdminChat {
  id: number;
  title: string;
  type: string;
  status: 'pending' | 'enabled' | 'disabled';
  creatorsMode: 'all' | 'list';
  creatorIds: number[];
  members: AdminMember[];
}

export type AdminCall = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; data: { chats?: AdminChat[]; error?: string } }>;

type ChatPatch = Partial<Pick<AdminChat, 'status' | 'creatorsMode' | 'creatorIds'>>;

const STATUS_LABEL = { pending: 'Ждёт включения', enabled: 'Работает', disabled: 'Отключён' } as const;
const dotClass = { pending: s.dot_pending, enabled: s.dot_enabled, disabled: s.dot_disabled } as const;
const SEARCH_FROM = 8;

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function MemberRow({ member, listMode, allowed, onToggle, onRename }: {
  member: AdminMember;
  listMode: boolean;
  allowed: boolean;
  onToggle: () => void;
  onRename: (displayName: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => { setValue(member.name); setEditing(true); };
  const submit = async (next: string) => {
    setSaving(true);
    const ok = await onRename(next);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <li className={s.memberEdit}>
        <Avatar name={member.name} size={28} />
        <input
          className={s.memberInput}
          value={value}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          aria-label="Имя участника"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(value); if (e.key === 'Escape') setEditing(false); }}
        />
        <div className={s.memberActions}>
          <button className={s.btnSmallPrimary} disabled={saving} onClick={() => void submit(value)}>Сохранить</button>
          {member.custom && <button className={s.btnSmall} disabled={saving} title="Вернуть имя из Telegram" onClick={() => void submit('')}>Сбросить</button>}
          <button className={s.btnSmall} disabled={saving} onClick={() => setEditing(false)}>Отмена</button>
        </div>
      </li>
    );
  }

  return (
    <li className={s.member}>
      <Avatar name={member.name} size={28} />
      <span className={s.memberName}>
        {member.name}
        {member.custom && <span className={s.memberTag}>своё имя</span>}
      </span>
      {listMode && (
        <button className={s.toggle} role="switch" aria-checked={allowed} aria-label={`${member.name}: может ставить задачи`} onClick={onToggle}>
          <span className={allowed ? s.switchOn : s.switch} />
          <span className={s.toggleText}>Ставит задачи</span>
        </button>
      )}
      <button className={s.linkBtn} onClick={start}>Изменить</button>
    </li>
  );
}

function ChatCard({ chat, open, onToggleOpen, onPatch, onRename }: {
  chat: AdminChat;
  open: boolean;
  onToggleOpen: () => void;
  onPatch: (body: ChatPatch) => void;
  onRename: (userId: number, displayName: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const title = chat.title || 'Без названия';
  const listMode = chat.creatorsMode === 'list';
  const count = chat.members.length;
  const q = query.trim().toLowerCase();
  const visible = q ? chat.members.filter((m) => m.name.toLowerCase().includes(q)) : chat.members;

  return (
    <section className={chat.status === 'pending' ? s.chatPending : s.chat}>
      <div className={s.chatHead}>
        <button className={s.chatToggle} aria-expanded={open} onClick={onToggleOpen}>
          <span className={s.tile} style={{ '--h': avatarHue(title) } as CSSProperties}>{Array.from(title)[0].toUpperCase()}</span>
          <span className={s.chatInfo}>
            <span className={s.chatTitle}>{title}</span>
            <span className={s.status}>
              <span className={s.statusMain}><span className={dotClass[chat.status]} />{STATUS_LABEL[chat.status]}</span>
              <span className={s.statusCount}>{count} {plural(count, 'участник', 'участника', 'участников')}</span>
            </span>
          </span>
          <span className={open ? s.chevronOpen : s.chevron}><IconChevronDown size={20} /></span>
        </button>
        {chat.status === 'enabled'
          ? <button className={s.btnSmall} onClick={() => onPatch({ status: 'disabled' })}>Отключить</button>
          : <button className={s.btnSmallPrimary} onClick={() => onPatch({ status: 'enabled' })}>Включить</button>}
      </div>

      {open && (
        <div className={s.body}>
          <div className={s.group}>
            <div className={s.groupLabel}>Кто может ставить задачи</div>
            <div className={s.seg} role="radiogroup" aria-label="Кто может ставить задачи">
              <button role="radio" aria-checked={!listMode} className={!listMode ? s.segOn : s.segBtn} onClick={() => onPatch({ creatorsMode: 'all' })}>Все участники</button>
              <button role="radio" aria-checked={listMode} className={listMode ? s.segOn : s.segBtn} onClick={() => onPatch({ creatorsMode: 'list' })}>Выбранные</button>
            </div>
            {listMode && <p className={s.hint}>Отметьте переключателем тех, кто может ставить задачи. Остальные только выполняют.</p>}
          </div>

          <div className={s.group}>
            <div className={s.groupLabel}>Участники и их имена</div>
            {count === 0 ? (
              <p className={s.hint}>Бот ещё не видел участников. Пусть они напишут что-нибудь в группе.</p>
            ) : (
              <>
                {count >= SEARCH_FROM && (
                  <input className={s.search} type="search" placeholder="Найти участника" aria-label="Найти участника" value={query} onChange={(e) => setQuery(e.target.value)} />
                )}
                <ul className={s.memberList}>
                  {visible.map((m) => (
                    <MemberRow
                      key={m.userId}
                      member={m}
                      listMode={listMode}
                      allowed={chat.creatorIds.includes(m.userId)}
                      onToggle={() => onPatch({ creatorIds: chat.creatorIds.includes(m.userId) ? chat.creatorIds.filter((id) => id !== m.userId) : [...chat.creatorIds, m.userId] })}
                      onRename={(name) => onRename(m.userId, name)}
                    />
                  ))}
                  {visible.length === 0 && <li className={s.hint}>Никого не нашли</li>}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Панель чатов. На сайте работает по cookie (есть «Выйти»),
 * в Mini App — по данным Telegram (есть «Назад», вход не нужен).
 */
export function AdminChats({ call, onUnauthorized, onLogout, onBack }: { call: AdminCall; onUnauthorized?: () => void; onLogout?: () => void; onBack?: () => void }) {
  const [chats, setChats] = useState<AdminChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
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

  const update = (id: number, fn: (c: AdminChat) => AdminChat) => setChats((prev) => prev && prev.map((c) => (c.id === id ? fn(c) : c)));

  // Меняем экран сразу; если сервер отказал — перезагружаем настоящее состояние.
  async function patch(id: number, body: ChatPatch) {
    update(id, (c) => ({ ...c, ...body }));
    const { status, data } = await call(`/api/admin/chats/${id}`, { method: 'PATCH', body });
    if (status >= 400) {
      setError(data.error ?? 'Не удалось сохранить');
      await load();
    } else setError(null);
  }

  async function rename(userId: number, displayName: string): Promise<boolean> {
    const { status, data } = await call(`/api/admin/users/${userId}`, { method: 'PATCH', body: { displayName } });
    if (status >= 400) {
      setError(data.error ?? 'Не удалось сохранить имя');
      return false;
    }
    await load();
    return true;
  }

  // Ждущие включения — наверху: им нужно действие.
  const sorted = useMemo(() => (chats ? [...chats].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')) : null), [chats]);

  const summary = useMemo(() => {
    if (!chats?.length) return null;
    const working = chats.filter((c) => c.status === 'enabled').length;
    const waiting = chats.filter((c) => c.status === 'pending').length;
    return [`${working} работают`, waiting ? `${waiting} ${plural(waiting, 'ждёт', 'ждут', 'ждут')} включения` : null].filter(Boolean).join(', ');
  }, [chats]);

  return (
    <main className={s.page}>
      <div className={embedded ? s.wrapEmbedded : s.wrap}>
        <div className={s.top}>
          <div>
            <h1 className={embedded ? s.titleEmbedded : s.title}>Чаты</h1>
            {summary && <p className={s.summary}>{summary}</p>}
          </div>
          {onLogout && <button className={s.btnSmall} onClick={onLogout}>Выйти</button>}
        </div>
        {error && <p className={s.errorBar} role="alert">{error}</p>}
        {!sorted ? (
          <div className={s.chats}>{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>
        ) : sorted.length === 0 ? (
          <div className={s.empty}>Пока нет ни одного чата.<br />Добавьте бота в группу и напишите там любое сообщение, и группа появится здесь.</div>
        ) : (
          <div className={s.chats}>
            {sorted.map((c) => (
              <ChatCard
                key={c.id}
                chat={c}
                open={openId === c.id}
                onToggleOpen={() => setOpenId(openId === c.id ? null : c.id)}
                onPatch={(body) => void patch(c.id, body)}
                onRename={rename}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
