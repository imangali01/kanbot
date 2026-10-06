'use client';
import { useEffect, useRef, useState } from 'react';
import { deadlineLabel } from '@/domain/dates';
import { activeMention, applyMention, filterMembers, splitMentions, type MentionMember } from '@/domain/mentions';
import { ticketId } from '@/domain/ticketId';
import { STATUSES, STATUS_TITLES, type BoardView, type Status, type TaskDetail } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { IconCalendar, IconCheck, IconChevronDown, IconLock, IconMore, IconReply, IconSend, IconStar, IconTrash, IconUser, IconUsers } from './icons';
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
  const [caret, setCaret] = useState(0);
  const [mentionIdx, setMentionIdx] = useState(0);
  const commentRef = useRef<HTMLInputElement>(null);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [pickAssignees, setPickAssignees] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // дропдауны закрываются по тапу мимо них
  useEffect(() => {
    if (!pickAssignees && !menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (pickAssignees && !pickerRef.current?.contains(target)) setPickAssignees(false);
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pickAssignees, menuOpen]);

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
    setMenuOpen(false);
    if (!detail || !(await confirmDialog(`Вы точно хотите удалить задачу ${ticketId(detail.card.number)}? Это нельзя отменить.`))) return;
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
    setCaret(0);
  }

  const card = detail?.card;
  const selectedKeys = new Set(card?.assignees.map((a) => a.key) ?? []);
  const pickable = [...board.members, ...(card?.assignees.filter((a) => a.userId === null) ?? [])];

  const mention = activeMention(comment, caret);
  const mentionOptions = mention ? filterMembers(board.members, mention.query) : [];
  const listOpen = mentionOptions.length > 0;
  const activeIdx = Math.min(mentionIdx, mentionOptions.length - 1);

  function pickMention(m: MentionMember) {
    if (!mention) return;
    const next = applyMention(comment, caret, mention.start, m);
    setComment(next.value);
    setCaret(next.caret);
    setMentionIdx(0);
    requestAnimationFrame(() => {
      const el = commentRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  function onCommentKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (listOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = mentionOptions.length;
        setMentionIdx((activeIdx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionOptions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCaret(0);
        return;
      }
    }
    if (e.key === 'Enter') void sendComment();
  }

  const footer = card && (
    <div className={s.composer}>
      {listOpen && (
        <div className={s.mentionList} role="listbox" aria-label="Упомянуть участника">
          {mentionOptions.map((m, i) => (
            <button
              key={m.key}
              role="option"
              aria-selected={i === activeIdx}
              className={i === activeIdx ? s.mentionItemOn : s.dropdownItem}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pickMention(m)}
            >
              <Avatar name={m.name} size={26} />
              <span className={s.dropdownName}>{m.name}</span>
              {m.username && <span className={s.muted}>@{m.username}</span>}
            </button>
          ))}
        </div>
      )}
      <input
        ref={commentRef}
        className={s.input}
        placeholder="Написать комментарий"
        value={comment}
        onChange={(e) => { setComment(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setMentionIdx(0); }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={onCommentKey}
      />
      <button className={s.send} disabled={!comment.trim() || busy} onClick={() => void sendComment()} aria-label="Отправить комментарий">
        <IconSend size={17} />
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
            <span className={s.num}>{ticketId(card.number)}</span>
            <div className={s.seg} role="radiogroup" aria-label="Статус">
              {STATUSES.map((st) => (
                <button key={st} role="radio" aria-checked={card.status === st} className={card.status === st ? s[`segOn_${st}`] : s.segBtn} disabled={!card.canEdit || busy} onClick={() => card.status !== st && void changeStatus(st)}>
                  <span className={s[`segDot_${st}`]} />{STATUS_TITLES[st]}
                </button>
              ))}
            </div>
            {card.canDelete && (
              <div className={s.menuWrap} ref={menuRef}>
                <button className={s.iconBtn} aria-label="Ещё" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><IconMore size={20} /></button>
                {menuOpen && (
                  <div className={s.menu} role="menu">
                    <button className={s.menuItemDanger} role="menuitem" onClick={() => void remove()}><IconTrash size={18} />Удалить задачу</button>
                  </div>
                )}
              </div>
            )}
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
              {card.canEdit ? (
                <button className={s.unlockBtn} disabled={busy} aria-label="Снять блок" title="Снять блок" onClick={() => void run(`/api/app/tasks/${taskId}/block`, 'DELETE')}><IconLock size={18} /></button>
              ) : (
                <IconLock size={18} />
              )}
              <div className={s.bannerBody}>{card.blockedReason}</div>
            </div>
          )}

          <div className={s.props}>
            <div className={s.prop}>
              <span className={s.propIcon}><IconUsers size={18} /></span>
              <span className={s.propLabel}>Исполнители</span>
              <div className={s.picker} ref={pickerRef}>
                <button className={s.pickerToggle} disabled={!card.canEdit || busy} aria-haspopup="listbox" aria-expanded={pickAssignees} onClick={() => setPickAssignees(!pickAssignees)}>
                  {card.assignees.length === 0 && <span className={s.muted}>{card.canEdit ? 'Назначить' : 'Не назначены'}</span>}
                  {card.assignees.length > 0 && (
                    <span className={s.faces}>
                      {card.assignees.slice(0, 5).map((a) => <Avatar key={a.key} name={a.name} size={28} />)}
                      {card.assignees.length > 5 && <span className={s.facesMore}>+{card.assignees.length - 5}</span>}
                    </span>
                  )}
                  {card.canEdit && <span className={s.pickerChevron}><IconChevronDown size={16} /></span>}
                </button>
                {pickAssignees && (
                  <div className={s.dropdown} role="listbox" aria-multiselectable="true" aria-label="Исполнители">
                    {pickable.map((m) => {
                      const on = selectedKeys.has(m.key);
                      return (
                        <button
                          key={m.key}
                          role="option"
                          aria-selected={on}
                          className={s.dropdownItem}
                          disabled={busy}
                          onClick={() => {
                            const next = new Set(selectedKeys);
                            if (on) next.delete(m.key); else next.add(m.key);
                            void patch({ assigneeKeys: [...next] });
                          }}
                        >
                          <Avatar name={m.name} size={26} />
                          <span className={s.dropdownName}>{m.name}</span>
                          <span className={on ? s.checkOn : s.check}>{on && <IconCheck size={14} />}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={s.prop}>
              <span className={s.propIcon}><IconCalendar size={18} /></span>
              <span className={s.propLabel}>Срок</span>
              <div className={s.propValueRow}>
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
                <div className={s.stack}>
                  <span>{card.authorName}</span>
                  <span className={s.muted}>{fmtDateTime(card.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={s.actions}>
            <button className={s.chipBtnPrimary} onClick={() => void showInChat()}><IconReply size={13} />Показать в чате</button>
            {card.canEdit && !card.blocked && blockReason === null && <button className={s.chipBtn} onClick={() => setBlockReason('')}><IconLock size={13} />Заблокировать</button>}
          </div>

          {blockReason !== null && (
            <div className={s.blockForm}>
              <input className={s.input} autoFocus placeholder="Почему задача заблокирована?" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className={s.btnPrimary} style={{ flex: 'none' }} disabled={!blockReason.trim() || busy} onClick={async () => { await run(`/api/app/tasks/${taskId}/block`, 'POST', { reason: blockReason.trim() }); setBlockReason(null); }}>Готово</button>
            </div>
          )}

          <h3 className={s.sectionTitle}>Комментарии</h3>
          <div className={s.comments}>
            {detail.comments.length === 0 && <div className={s.noComments}>Пока без комментариев</div>}
            {detail.comments.map((c) =>
              c.kind === 'system' ? (
                <div key={c.id} className={s.system}>{c.text} · {fmtDateTime(c.createdAt)}</div>
              ) : (
                <div key={c.id} className={s.comment}>
                  <Avatar name={c.authorName ?? ''} size={28} />
                  <div className={s.commentBody}>
                    <div className={s.commentHead}><span className={s.commentName}>{c.authorName}</span><span className={s.commentTime}>{fmtDateTime(c.createdAt)}</span></div>
                    <p className={s.commentText}>
                      {splitMentions(c.text, board.members).map((seg, i) =>
                        seg.type === 'mention' ? <span key={i} className={s.mention}>{seg.text}</span> : seg.text,
                      )}
                    </p>
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
