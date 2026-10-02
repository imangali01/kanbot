'use client';
import { useEffect, useRef, useState } from 'react';
import { deadlineLabel } from '@/domain/dates';
import { STATUSES, STATUS_TITLES, type BoardView, type Status, type TaskDetail } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { IconBlock, IconCalendar, IconChat, IconSend, IconStar, IconTrash, IconUser, IconUsers } from './icons';
import { Sheet } from './Sheet';
import { confirmDialog, webApp } from './telegram';
import s from './miniapp.module.css';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function CardSheet({ taskId, board, onClose, onChanged }: { taskId: number; board: BoardView; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [pickAssignees, setPickAssignees] = useState(false);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<TaskDetail>(`/api/app/tasks/${taskId}`)
      .then((d) => { setDetail(d); setText(d.card.text); })
      .catch((e) => setError(errorText(e)));
  }, [taskId]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, detail]);

  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const d = await api<TaskDetail>(path, { method, body });
      setDetail(d);
      setText(d.card.text);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>) => run(`/api/app/tasks/${taskId}`, 'PATCH', body);

  async function changeStatus(status: Status) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/app/tasks/${taskId}/move`, { method: 'POST', body: { status, aboveId: null } });
      const d = await api<TaskDetail>(`/api/app/tasks/${taskId}`);
      setDetail(d);
      onChanged();
      webApp()?.HapticFeedback?.impactOccurred('light');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function showInChat() {
    try {
      const r = await api<{ mode: 'link'; url: string } | { mode: 'pinged' }>(`/api/app/tasks/${taskId}/show-in-chat`, { method: 'POST' });
      if (r.mode === 'link') webApp()?.openTelegramLink(r.url);
      else webApp()?.close();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!(await confirmDialog('Удалить задачу? Это нельзя отменить.'))) return;
    try {
      await api(`/api/app/tasks/${taskId}`, { method: 'DELETE' });
      onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function sendComment() {
    const value = comment.trim();
    if (!value || busy) return;
    await run(`/api/app/tasks/${taskId}/comments`, 'POST', { text: value });
    setComment('');
  }

  const card = detail?.card;
  const selectedKeys = new Set(card?.assignees.map((a) => a.key) ?? []);
  const pickable = [...board.members, ...(card?.assignees.filter((a) => a.userId === null) ?? [])];

  const footer = card && (
    <div className={s.composer}>
      <input className={s.input} placeholder="Написать комментарий" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendComment()} />
      <button className={s.send} disabled={!comment.trim() || busy} onClick={() => void sendComment()} aria-label="Отправить комментарий">
        <IconSend size={20} />
      </button>
    </div>
  );

  return (
    <Sheet onClose={onClose} label="Карточка задачи" footer={footer}>
      {!card ? (
        <div className={s.center}>{error ?? 'Загрузка…'}</div>
      ) : (
        <>
          <div className={s.headRow}>
            <span className={s.num}>#{card.number}</span>
            <div className={s.seg} role="radiogroup" aria-label="Статус">
              {STATUSES.map((st) => (
                <button key={st} role="radio" aria-checked={card.status === st} className={card.status === st ? s.segOn : s.segBtn} disabled={!card.canEdit || busy} onClick={() => card.status !== st && void changeStatus(st)}>
                  {STATUS_TITLES[st]}
                </button>
              ))}
            </div>
          </div>

          {card.canEditText ? (
            <textarea
              ref={textRef}
              rows={1}
              className={s.textField}
              value={text}
              aria-label="Текст задачи"
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text.trim() && text.trim() !== card.text && void patch({ text: text.trim() })}
            />
          ) : (
            <p className={s.textStatic}>{card.text}</p>
          )}

          {card.blocked && (
            <div className={s.banner}>
              <IconBlock size={18} />
              <div className={s.bannerBody}>
                <div>{card.blockedReason}</div>
                {card.canEdit && <button className={s.linkBtn} disabled={busy} onClick={() => void run(`/api/app/tasks/${taskId}/block`, 'DELETE')}>Снять блок</button>}
              </div>
            </div>
          )}

          <div className={s.props}>
            <div className={s.prop}>
              <span className={s.propIcon}><IconUsers size={18} /></span>
              <span className={s.propLabel}>Исполнители</span>
              <div className={s.propValue}>
                {!pickAssignees && card.assignees.length === 0 && <span className={s.muted}>Не назначены</span>}
                {!pickAssignees && card.assignees.map((a) => (
                  <span key={a.key} className={s.pill}><Avatar name={a.name} size={22} /><span className={s.pillText}>{a.name.split(' ')[0]}</span></span>
                ))}
                {pickAssignees && pickable.map((m) => (
                  <button
                    key={m.key}
                    className={selectedKeys.has(m.key) ? s.pillOn : s.pillBtn}
                    disabled={busy}
                    aria-pressed={selectedKeys.has(m.key)}
                    onClick={() => {
                      const next = new Set(selectedKeys);
                      if (next.has(m.key)) next.delete(m.key); else next.add(m.key);
                      void patch({ assigneeKeys: [...next] });
                    }}
                  >
                    <Avatar name={m.name} size={22} /><span className={s.pillText}>{m.name.split(' ')[0]}</span>
                  </button>
                ))}
                {card.canEdit && <button className={s.pillGhost} onClick={() => setPickAssignees(!pickAssignees)}>{pickAssignees ? 'Готово' : card.assignees.length ? 'Изменить' : 'Назначить'}</button>}
              </div>
            </div>

            <div className={s.prop}>
              <span className={s.propIcon}><IconCalendar size={18} /></span>
              <span className={s.propLabel}>Срок</span>
              <div className={s.propValue}>
                <input type="date" required className={s.dateInput} value={card.deadline} disabled={!card.canEdit || busy} aria-label="Срок выполнения" onChange={(e) => e.target.value && void patch({ deadline: e.target.value })} />
                <span className={s.muted}>{deadlineLabel(card.deadline, new Date())}</span>
              </div>
            </div>

            <div className={s.prop}>
              <span className={s.propIcon}><IconStar size={18} /></span>
              <span className={s.propLabel}>Сложность</span>
              <div className={s.propValue} role="radiogroup" aria-label="Сложность">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} role="radio" aria-checked={card.stars === n} aria-label={`${n} из 5`} className={n <= card.stars ? s.starOn : s.starBtn} disabled={!card.canEdit || busy} onClick={() => void patch({ stars: n })}>
                    <IconStar size={22} filled />
                  </button>
                ))}
              </div>
            </div>

            <div className={s.prop}>
              <span className={s.propIcon}><IconUser size={18} /></span>
              <span className={s.propLabel}>Поставил</span>
              <div className={s.propValue}>
                <span>{card.authorName}</span>
                <span className={s.muted}>{fmtDateTime(card.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className={s.actions}>
            <button className={s.btnPrimary} onClick={() => void showInChat()}><IconChat size={18} />Показать в чате</button>
            {card.canEdit && !card.blocked && blockReason === null && <button className={s.btn} onClick={() => setBlockReason('')}>Заблокировать</button>}
            {card.canDelete && <button className={s.btnDanger} onClick={() => void remove()} aria-label="Удалить задачу"><IconTrash size={20} /></button>}
          </div>

          {blockReason !== null && (
            <div className={s.blockForm}>
              <input className={s.input} autoFocus placeholder="Почему задача заблокирована?" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className={s.btnPrimary} style={{ flex: 'none' }} disabled={!blockReason.trim() || busy} onClick={async () => { await run(`/api/app/tasks/${taskId}/block`, 'POST', { reason: blockReason.trim() }); setBlockReason(null); }}>Готово</button>
            </div>
          )}

          <h3 className={s.sectionTitle}>Комментарии</h3>
          <div className={s.comments}>
            {detail.comments.length === 0 && <div className={s.noComments}>Пока без комментариев. Ваш комментарий увидят и в группе.</div>}
            {detail.comments.map((c) =>
              c.kind === 'system' ? (
                <div key={c.id} className={s.system}>{c.text} · {fmtDateTime(c.createdAt)}</div>
              ) : (
                <div key={c.id} className={s.comment}>
                  <Avatar name={c.authorName ?? ''} size={28} />
                  <div className={s.commentBody}>
                    <div className={s.commentHead}><span className={s.commentName}>{c.authorName}</span><span className={s.commentTime}>{fmtDateTime(c.createdAt)}</span></div>
                    <p className={s.commentText}>{c.text}</p>
                  </div>
                </div>
              ),
            )}
          </div>
          {error && <p className={s.errorLine} role="alert">{error}</p>}
        </>
      )}
    </Sheet>
  );
}
