'use client';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_ASSIGNEE, sortCards, visibleCards } from '@/domain/board';
import { STATUSES, STATUS_TITLES, type BoardView, type CardView, type SortMode, type Status } from '@/domain/types';
import { api, errorText } from './api';
import { CardItem, CardOverlay } from './CardItem';
import { CardSheet } from './CardSheet';
import { loadPrefs, savePrefs, type BoardPrefs } from './prefs';
import { webApp } from './telegram';
import s from './miniapp.module.css';

type Columns = Record<Status, CardView[]>;

function buildColumns(cards: CardView[], prefs: BoardPrefs): Columns {
  const visible = visibleCards(cards, { now: new Date(), showAll: prefs.showAll, assigneeKey: prefs.assigneeKey });
  const by = (st: Status) => sortCards(visible.filter((c) => c.status === st), prefs.sort);
  return { todo: by('todo'), in_progress: by('in_progress'), done: by('done') };
}

function Column({ status, cards, onOpen }: { status: Status; cards: CardView[]; onOpen: (id: number) => void }) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section className={s.column}>
      <div className={s.columnHead}><span>{STATUS_TITLES[status]}</span><span>{cards.length}</span></div>
      <SortableContext id={status} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={s.columnBody}>
          {cards.map((c) => <CardItem key={c.id} card={c} onOpen={onOpen} />)}
        </div>
      </SortableContext>
    </section>
  );
}

const SORT_LABELS: Record<SortMode, string> = { manual: 'Свой порядок', created: 'По дате', stars: 'По звёздам', deadline: 'По дедлайну' };

export function Board({ chatId, openTaskNumber, onBack }: { chatId: number; openTaskNumber: number | null; onBack: () => void }) {
  const [board, setBoard] = useState<BoardView | null>(null);
  const [prefs, setPrefs] = useState<BoardPrefs>(() => loadPrefs(chatId));
  const [columns, setColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dragFrom = useRef<Status | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const openedFromParam = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await api<BoardView>(`/api/app/chats/${chatId}/board`));
    } catch (e) {
      setToast(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (board) setColumns(buildColumns(board.cards, prefs)); }, [board, prefs]);
  useEffect(() => { savePrefs(chatId, prefs); }, [chatId, prefs]);
  useEffect(() => {
    if (!board || !openTaskNumber || openedFromParam.current) return;
    openedFromParam.current = true;
    const card = board.cards.find((c) => c.number === openTaskNumber);
    if (card) setOpenId(card.id);
  }, [board, openTaskNumber]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    const handler = () => (openId !== null ? setOpenId(null) : onBack());
    back.show();
    back.onClick(handler);
    return () => back.offClick(handler);
  }, [openId, onBack]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  function findColumn(id: UniqueIdentifier, cols: Columns): Status | null {
    if (typeof id === 'string' && (STATUSES as string[]).includes(id)) return id as Status;
    return STATUSES.find((st) => cols[st].some((c) => c.id === id)) ?? null;
  }

  function onDragStart(e: DragStartEvent) {
    if (!columns) return;
    setActiveId(Number(e.active.id));
    dragFrom.current = findColumn(e.active.id, columns);
    snapshot.current = columns;
    webApp()?.HapticFeedback?.impactOccurred('medium');
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    setColumns((prev) => {
      if (!prev) return prev;
      const from = findColumn(active.id, prev);
      const to = findColumn(over.id, prev);
      if (!from || !to || from === to) return prev;
      const card = prev[from].find((c) => c.id === active.id);
      if (!card) return prev;
      const overIndex = prev[to].findIndex((c) => c.id === over.id);
      const index = prefs.sort === 'manual' ? (overIndex >= 0 ? overIndex : prev[to].length) : 0;
      const target = [...prev[to]];
      target.splice(index, 0, { ...card, status: to });
      return { ...prev, [from]: prev[from].filter((c) => c.id !== active.id), [to]: target };
    });
  }

  function restore() {
    if (snapshot.current) setColumns(snapshot.current);
  }

  async function persistMove(taskId: number, status: Status, aboveId: number | null) {
    try {
      setBoard(await api<BoardView>(`/api/app/tasks/${taskId}/move`, { method: 'POST', body: { status, aboveId } }));
    } catch (e) {
      restore();
      setToast(errorText(e));
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    const from = dragFrom.current;
    if (!over || !columns || !from) return restore();
    const to = findColumn(active.id, columns);
    if (!to) return restore();

    let col = columns[to];
    if (prefs.sort === 'manual') {
      const oldIndex = col.findIndex((c) => c.id === active.id);
      const overIndex = col.findIndex((c) => c.id === over.id);
      if (overIndex >= 0 && oldIndex !== overIndex) col = arrayMove(col, oldIndex, overIndex);
      if (from === to && oldIndex === overIndex) return;
    } else if (from === to) {
      return;
    }
    const index = col.findIndex((c) => c.id === active.id);
    const aboveId = prefs.sort === 'manual' && index > 0 ? col[index - 1].id : null;
    setColumns({ ...columns, [to]: col });
    void persistMove(Number(active.id), to, aboveId);
  }

  if (!board || !columns) return <div className={s.center}>{loading ? 'Загрузка…' : toast ?? ''}</div>;
  const active = activeId !== null ? board.cards.find((c) => c.id === activeId) ?? null : null;

  return (
    <>
      <header className={s.header}>
        <h1 className={s.title}>{board.chat.title}</h1>
        <select className={s.control} value={prefs.assigneeKey ?? ''} onChange={(e) => setPrefs({ ...prefs, assigneeKey: e.target.value || null })}>
          <option value="">Все исполнители</option>
          <option value={NO_ASSIGNEE}>Без исполнителя</option>
          {board.members.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
        <select className={s.control} value={prefs.sort} onChange={(e) => setPrefs({ ...prefs, sort: e.target.value as SortMode })}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => <option key={m} value={m}>{SORT_LABELS[m]}</option>)}
        </select>
        <button className={prefs.showAll ? s.iconBtnActive : s.iconBtn} title="Показать старые Done" onClick={() => setPrefs({ ...prefs, showAll: !prefs.showAll })}>👁</button>
        <button className={s.iconBtn} title="Обновить" onClick={() => void refresh()} disabled={loading}>{loading ? '…' : '↻'}</button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); restore(); }}>
        <div className={activeId !== null ? s.boardDragging : s.board}>
          {STATUSES.map((st) => <Column key={st} status={st} cards={columns[st]} onOpen={setOpenId} />)}
        </div>
        <DragOverlay>{active ? <CardOverlay card={active} /> : null}</DragOverlay>
      </DndContext>
      {openId !== null && <CardSheet taskId={openId} board={board} onClose={() => setOpenId(null)} onChanged={() => void refresh()} />}
      {toast && <div className={s.toast}>{toast}</div>}
    </>
  );
}
