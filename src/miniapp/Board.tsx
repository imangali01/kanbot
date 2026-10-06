'use client';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_ASSIGNEE, sortCards, visibleCards } from '@/domain/board';
import { STATUSES, STATUS_TITLES, type BoardView, type CardView, type Status } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { CardItem, CardOverlay } from './CardItem';
import { CardSheet } from './CardSheet';
import { IconChart, IconClose, IconRefresh, IconSearch, IconSliders } from './icons';
import { OptionsSheet } from './OptionsSheet';
import { loadPrefs, savePrefs, type BoardPrefs } from './prefs';
import { webApp } from './telegram';
import s from './miniapp.module.css';

type Columns = Record<Status, CardView[]>;

const EMPTY_TEXT: Record<Status, string> = {
  todo: 'Здесь пусто. Новые задачи появятся после команды /task в чате.',
  in_progress: 'Ничего не в работе. Перетащите сюда задачу, когда возьмётесь за неё.',
  done: 'Пока ничего не закрыто.',
};

const POLL_MS = 4000;

function buildColumns(cards: CardView[], prefs: BoardPrefs, query: string): Columns {
  const visible = visibleCards(cards, { now: new Date(), showAll: prefs.showAll, assigneeKey: prefs.assigneeKey, query });
  const by = (st: Status) => sortCards(visible.filter((c) => c.status === st), prefs.sort);
  return { todo: by('todo'), in_progress: by('in_progress'), done: by('done') };
}

function Column({ status, cards, searching, onOpen }: { status: Status; cards: CardView[]; searching: boolean; onOpen: (id: number) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section className={s.col} aria-label={STATUS_TITLES[status]}>
      <div className={s.colHead}>
        <span className={s[`dot_${status}`]} />
        <span>{STATUS_TITLES[status]}</span>
        <span className={s.tabCount}>{cards.length}</span>
      </div>
      <SortableContext id={status} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={isOver ? `${s.colBody} ${s.colOver}` : s.colBody}>
          {cards.map((c) => <CardItem key={c.id} card={c} onOpen={onOpen} />)}
          {cards.length === 0 && <div className={s.empty}>{searching ? 'Ничего не найдено.' : EMPTY_TEXT[status]}</div>}
        </div>
      </SortableContext>
    </section>
  );
}

export function Board({ chatId, openTaskNumber, onBack, onAnalytics }: { chatId: number; openTaskNumber: number | null; onBack: () => void; onAnalytics: (title: string) => void }) {
  const [board, setBoard] = useState<BoardView | null>(null);
  const [prefs, setPrefs] = useState<BoardPrefs>(() => loadPrefs(chatId));
  const [columns, setColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<Status | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const openedFromParam = useRef(false);
  const knownVersion = useRef<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setBoard(await api<BoardView>(`/api/app/chats/${chatId}/board`));
    } catch (e) {
      if (!silent) setToast(errorText(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [chatId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (board) setColumns(buildColumns(board.cards, prefs, query)); }, [board, prefs, query]);
  useEffect(() => { knownVersion.current = board?.version ?? null; }, [board]);
  useEffect(() => { busy.current = activeId !== null; }, [activeId]);
  useEffect(() => { savePrefs(chatId, prefs); }, [chatId, prefs]);
  useEffect(() => {
    if (!board || !openTaskNumber || openedFromParam.current) return;
    openedFromParam.current = true;
    const card = board.cards.find((c) => c.number === openTaskNumber);
    if (card) setOpenId(card.id);
  }, [board, openTaskNumber]);
  // Автообновление: изменения других людей подтягиваются сами, без кнопки «Обновить».
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.hidden || busy.current || knownVersion.current === null) return;
      try {
        const { version } = await api<{ version: string }>(`/api/app/chats/${chatId}/version`);
        if (!stopped && !busy.current && version !== knownVersion.current) await refresh(true);
      } catch {
        // сеть моргнула: попробуем в следующий раз
      }
    };
    const timer = setInterval(() => void check(), POLL_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [chatId, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    const handler = () => (openId !== null ? setOpenId(null) : showOptions ? setShowOptions(false) : searchOpen ? closeSearch() : onBack());
    back.show();
    back.onClick(handler);
    return () => back.offClick(handler);
  }, [openId, showOptions, searchOpen, onBack]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const columnStep = useCallback(() => {
    const el = scroller.current;
    const first = el?.children[0] as HTMLElement | undefined;
    return first ? first.getBoundingClientRect().width + 10 : 0;
  }, []);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    const step = columnStep();
    if (el && step) setTab(Math.min(2, Math.max(0, Math.round(el.scrollLeft / step))));
  }, [columnStep]);

  function goToTab(i: number) {
    setTab(i);
    scroller.current?.scrollTo({ left: i * columnStep(), behavior: 'smooth' });
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
  }

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
      webApp()?.HapticFeedback?.impactOccurred('light');
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

  if (!board || !columns) {
    return (
      <div className={s.skeletons} aria-busy="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className={s.skel} />)}
      </div>
    );
  }

  const active = activeId !== null ? board.cards.find((c) => c.id === activeId) ?? null : null;
  const meKey = `u:${board.me.userId}`;
  const others = board.members.filter((m) => m.key !== meKey);
  const filterBtn = (key: string | null, label: string, avatar?: string) => {
    const on = prefs.assigneeKey === key;
    const cls = avatar ? (on ? s.filterAvOn : s.filterAv) : on ? s.filterOn : s.filter;
    return (
      <button key={key ?? 'all'} className={cls} aria-pressed={on} onClick={() => setPrefs({ ...prefs, assigneeKey: on && key !== null ? null : key })}>
        {avatar && <Avatar name={avatar} size={24} />}
        {label}
      </button>
    );
  };
  const nonDefault = prefs.sort !== 'manual' || prefs.showAll;

  return (
    <>
      <header className={s.top}>
        <div className={s.titleRow}>
          <h1 className={s.title}>{board.chat.title || 'Доска'}</h1>
          <button className={query ? `${s.iconBtn} ${s.badgeDot}` : s.iconBtn} onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))} aria-label="Поиск по карточкам" aria-expanded={searchOpen}>
            <IconSearch />
          </button>
          <button className={s.iconBtn} onClick={() => onAnalytics(board.chat.title || 'Доска')} aria-label="Аналитика">
            <IconChart />
          </button>
          <button className={loading ? `${s.iconBtn} ${s.spin}` : s.iconBtn} onClick={() => void refresh()} disabled={loading} aria-label="Обновить доску">
            <IconRefresh />
          </button>
          <button className={nonDefault ? `${s.iconBtn} ${s.badgeDot}` : s.iconBtn} onClick={() => setShowOptions(true)} aria-label="Настройки доски">
            <IconSliders />
          </button>
        </div>
        {searchOpen && (
          <div className={s.searchRow}>
            <input
              className={s.searchInput}
              type="search"
              enterKeyHint="search"
              autoFocus
              placeholder="Слово или ID, например SD-0004"
              aria-label="Поиск по карточкам"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            />
            <button className={s.iconBtn} onClick={closeSearch} aria-label="Закрыть поиск"><IconClose size={18} /></button>
          </div>
        )}
        <div className={s.filters} role="group" aria-label="Фильтр по исполнителю">
          {filterBtn(null, 'Все')}
          {filterBtn(meKey, 'Мои')}
          {filterBtn(NO_ASSIGNEE, 'Без исполнителя')}
          {others.map((m) => filterBtn(m.key, m.name.split(' ')[0], m.name))}
        </div>
        <div className={s.tabs} role="tablist">
          {STATUSES.map((st, i) => (
            <button key={st} role="tab" aria-selected={tab === i} className={tab === i ? s.tabOn : s.tab} onClick={() => goToTab(i)}>
              <span className={s[`dot_${st}`]} />
              {STATUS_TITLES[st]}
              <span className={s.tabCount}>{columns[st].length}</span>
            </button>
          ))}
          <span className={s.indicator} style={{ transform: `translateX(${tab * 100}%)` }} />
        </div>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); restore(); }}>
        <div ref={scroller} onScroll={onScroll} className={activeId !== null ? s.boardDragging : s.board}>
          {STATUSES.map((st) => <Column key={st} status={st} cards={columns[st]} searching={query.trim() !== ''} onOpen={setOpenId} />)}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{active ? <CardOverlay card={active} /> : null}</DragOverlay>
      </DndContext>

      {openId !== null && <CardSheet taskId={openId} board={board} onClose={() => setOpenId(null)} onChanged={() => void refresh(true)} />}
      {showOptions && (
        <OptionsSheet
          prefs={prefs}
          onChange={setPrefs}
          onClose={() => setShowOptions(false)}
          myName={board.members.find((m) => m.userId === board.me.userId)?.name ?? ''}
          onRename={async (displayName) => {
            try {
              await api('/api/app/me', { method: 'PATCH', body: { displayName } });
              await refresh();
              setToast('Имя сохранено');
            } catch (e) {
              setToast(errorText(e));
            }
          }}
        />
      )}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </>
  );
}
