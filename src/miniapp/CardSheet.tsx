'use client';
import { useEffect, useState } from 'react';
import { STATUS_TITLES, type BoardView, type TaskDetail } from '@/domain/types';
import { api, errorText } from './api';
import { confirmDialog, webApp } from './telegram';
import s from './miniapp.module.css';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function CardSheet({ taskId, board, onClose, onChanged }: { taskId: number; board: BoardView; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [pickAssignees, setPickAssignees] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<TaskDetail>(`/api/app/tasks/${taskId}`)
      .then((d) => { setDetail(d); setText(d.card.text); })
      .catch((e) => setError(errorText(e)));
  }, [taskId]);

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
    if (!(await confirmDialog('Удалить задачу?'))) return;
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
    if (!value) return;
    await run(`/api/app/tasks/${taskId}/comments`, 'POST', { text: value });
    setComment('');
  }

  const card = detail?.card;
  const selectedKeys = new Set(card?.assignees.map((a) => a.key) ?? []);
  const pickable = [...board.members, ...(card?.assignees.filter((a) => a.userId === null) ?? [])];

  return (
    <>
      <div className={s.sheetBackdrop} onClick={onClose} />
      <div className={s.sheet} role="dialog">
        <div className={s.sheetHead}>
          <span>{card ? `#${card.number} · ${STATUS_TITLES[card.status]}` : ''}</span>
          <button className={s.closeBtn} onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {!card ? (
          <div className={s.center}>{error ?? 'Загрузка…'}</div>
        ) : (
          <>
            {card.blocked && (
              <div className={s.banner}>
                ⛔ Заблокировано: {card.blockedReason}
                {card.canEdit && (
                  <div><button className={s.btn} disabled={busy} onClick={() => run(`/api/app/tasks/${taskId}/block`, 'DELETE')}>Снять блок</button></div>
                )}
              </div>
            )}

            {card.canEditText ? (
              <textarea className={s.textArea} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() && text !== card.text && patch({ text: text.trim() })} />
            ) : (
              <p className={s.textStatic}>{card.text}</p>
            )}

            <div className={s.row}>
              <span className={s.label}>Сложность</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={n <= card.stars ? s.starOn : s.starBtn} disabled={!card.canEdit || busy} onClick={() => patch({ stars: n })}>★</button>
              ))}
            </div>

            <div className={s.row}>
              <span className={s.label}>Дедлайн</span>
              <input type="date" required className={s.control} value={card.deadline} disabled={!card.canEdit || busy} onChange={(e) => e.target.value && patch({ deadline: e.target.value })} />
            </div>

            <div className={s.row}>
              <span className={s.label}>Исполнители</span>
              {card.assignees.length === 0 && <span className={s.cardNum}>нет</span>}
              {!pickAssignees && card.assignees.map((a) => <span key={a.key} className={s.chip}>{a.name}</span>)}
              {pickAssignees && pickable.map((m) => (
                <button
                  key={m.key}
                  className={selectedKeys.has(m.key) ? s.chipOn : s.chip}
                  disabled={busy}
                  onClick={() => {
                    const next = new Set(selectedKeys);
                    if (next.has(m.key)) next.delete(m.key); else next.add(m.key);
                    void patch({ assigneeKeys: [...next] });
                  }}
                >{m.name}</button>
              ))}
              {card.canEdit && <button className={s.chip} onClick={() => setPickAssignees(!pickAssignees)}>{pickAssignees ? 'Готово' : 'Изменить'}</button>}
            </div>

            <div className={s.row}>
              <span className={s.label}>Поставил</span>
              <span>{card.authorName} · {fmtDateTime(card.createdAt)}</span>
            </div>

            <div className={s.actions}>
              <button className={s.btnPrimary} onClick={() => void showInChat()}>Показать в чате</button>
              {card.canEdit && !card.blocked && blockReason === null && <button className={s.btn} onClick={() => setBlockReason('')}>Заблокировать</button>}
              {card.canDelete && <button className={s.btnDanger} onClick={() => void remove()}>Удалить</button>}
            </div>

            {blockReason !== null && (
              <div className={s.commentForm}>
                <input className={s.commentInput} autoFocus placeholder="Причина блокировки" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
                <button className={s.btnPrimary} disabled={!blockReason.trim() || busy} onClick={async () => { await run(`/api/app/tasks/${taskId}/block`, 'POST', { reason: blockReason.trim() }); setBlockReason(null); }}>OK</button>
                <button className={s.btn} onClick={() => setBlockReason(null)}>Отмена</button>
              </div>
            )}

            <div className={s.label}>Комментарии</div>
            <div className={s.comments}>
              {detail.comments.map((c) =>
                c.kind === 'system' ? (
                  <div key={c.id} className={s.commentSystem}>{c.text} · {fmtDateTime(c.createdAt)}</div>
                ) : (
                  <div key={c.id} className={s.comment}>
                    <div className={s.commentMeta}>{c.authorName} · {fmtDateTime(c.createdAt)}</div>
                    {c.text}
                  </div>
                ),
              )}
            </div>
            <div className={s.commentForm}>
              <input className={s.commentInput} placeholder="Комментарий…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void sendComment()} />
              <button className={s.btnPrimary} disabled={!comment.trim() || busy} onClick={() => void sendComment()}>➤</button>
            </div>
            {error && <div className={s.banner}>{error}</div>}
          </>
        )}
      </div>
    </>
  );
}
