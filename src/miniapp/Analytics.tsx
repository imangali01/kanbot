'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { dayNumber } from '@/domain/dates';
import { ticketId } from '@/domain/ticketId';
import type { AnalyticsDays, AnalyticsView, CfdPoint, CycleItem, FlowSignal, Kpi } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { webApp } from './telegram';
import a from './analytics.module.css';

const PERIODS: AnalyticsDays[] = [7, 30, 90];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** Порог, с которого перцентили имеют смысл (совпадает с MIN_SLE_SAMPLE в домене). */
const MIN_SAMPLE = 5;
const AGING_VISIBLE = 6;

const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const range = (from: string, to: string) => (from === to ? short(from) : `${short(from)} – ${short(to)}`);
const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const tasksWord = (n: number) => plural(n, 'задача', 'задачи', 'задач');

const SIGNALS: Record<FlowSignal, string> = {
  steady: 'Поток ровный: полосы держат ширину, задачи закрываются в том же темпе, в каком приходят.',
  wipGrowing: 'Полоса In progress расширяется — задач берут в работу больше, чем заканчивают.',
  doneFlat: 'Линия Done плоская в последние дни — ничего не закрывается.',
  queueGrowing: 'Очередь Todo растёт быстрее, чем её разбирают.',
  queueShrinking: 'Очередь Todo тает — команда разбирает накопленное.',
  doneDrops: 'Линия Done проседает — задачи возвращали из Done.',
};

/** Ширина контейнера в px: SVG рисуем в масштабе 1:1, чтобы подписи не раздувались на широком экране. */
function useWidth<T extends HTMLElement>(fallback = 340) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Курсор по графику: тап/перетаскивание пальцем, наведение мышью, стрелки на клавиатуре. */
function useCursor(count: number, pick: (x: number, y: number) => number | null) {
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => setIdx(null), [count]);
  const at = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vb = e.currentTarget.viewBox.baseVal;
    return pick(((e.clientX - r.left) * vb.width) / r.width, ((e.clientY - r.top) * vb.height) / r.height);
  };
  const svg = {
    onPointerDown: (e: PointerEvent<SVGSVGElement>) => setIdx(at(e)),
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => { if (e.pointerType === 'mouse' || e.buttons) setIdx(at(e)); },
    onPointerLeave: (e: PointerEvent<SVGSVGElement>) => { if (e.pointerType === 'mouse') setIdx(null); },
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (count === 0) return;
    const next = { ArrowLeft: (i: number | null) => Math.max(0, (i ?? count) - 1), ArrowRight: (i: number | null) => Math.min(count - 1, (i ?? -1) + 1), Home: () => 0, End: () => count - 1, Escape: () => null }[e.key];
    if (!next) return;
    e.preventDefault();
    setIdx(next);
  };
  return { idx, svg, onKeyDown };
}

/** Термин с объяснением по тапу: кнопка в строке заголовка, пояснение — отдельной строкой под ним. */
function Term({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className={a.term} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}</button>
      {open && <span id={id} className={a.termNote}>{children}</span>}
    </>
  );
}

function Delta({ kpi, lowerIsBetter = false, unit = '' }: { kpi: Kpi; lowerIsBetter?: boolean; unit?: string }) {
  if (kpi.value === null || kpi.prev === null) return <span className={a.statSub}>—</span>;
  const d = Math.round((kpi.value - kpi.prev) * 10) / 10;
  if (d === 0) return <span className={a.statSub}>как раньше</span>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return (
    <span className={a.statSub} title={`Прошлый период: ${num(kpi.prev)}${unit}`}>
      <span className={good ? a.up : a.down}>{d > 0 ? '▲' : '▼'} {num(Math.abs(d))}{unit}</span>
    </span>
  );
}

/* ───────── CFD ───────── */

const CFD_H = 210;
const CFD_PAD = { l: 30, r: 6, t: 8, b: 22 };

function Cfd({ points }: { points: CfdPoint[] }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const n = points.length;
  const plotW = W - CFD_PAD.l - CFD_PAD.r;
  const plotH = CFD_H - CFD_PAD.t - CFD_PAD.b;
  const x = (i: number) => CFD_PAD.l + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  // низ шкалы — Done на начало периода: иначе закрытое за всю историю задавит слои WIP и очереди
  const yMin = Math.min(...points.map((p) => p.done));
  const total = (p: CfdPoint) => p.todo + p.inProgress + p.done;
  const yMax = Math.max(yMin + 1, ...points.map(total));
  const y = (v: number) => CFD_PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const cursor = useCursor(n, (px) => Math.max(0, Math.min(n - 1, Math.round(((px - CFD_PAD.l) / plotW) * (n - 1)))));

  const done = points.map((p) => p.done);
  const wip = points.map((p) => p.done + p.inProgress);
  const all = points.map(total);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = (lo: number[], hi: number[]) =>
    `${line(hi)}${lo.map((_, k) => { const i = lo.length - 1 - k; return `L${x(i).toFixed(1)},${y(lo[i]).toFixed(1)}`; }).join('')}Z`;

  const step = Math.max(1, Math.ceil((yMax - yMin) / 3));
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);
  const xLabels = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0, n - 1];
  const shown = points[cursor.idx ?? n - 1];
  const last = points[n - 1];
  const nameAt = (lo: number, hi: number, text: string) =>
    y(lo) - y(hi) >= 14 && plotW > 200 ? <text className={text === 'Done' ? a.layerName : a.layerNameDark} x={x(n - 1) - 6} y={(y(lo) + y(hi)) / 2 + 3.5} textAnchor="end">{text}</text> : null;

  return (
    <>
      <div
        ref={wrapRef}
        className={a.chart}
        tabIndex={0}
        role="slider"
        aria-label="День на диаграмме потока"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={cursor.idx ?? n - 1}
        aria-valuetext={`${short(shown.date)}: Todo ${shown.todo}, In progress ${shown.inProgress}, Done ${shown.done}`}
        onKeyDown={cursor.onKeyDown}
      >
        <svg
          viewBox={`0 0 ${W} ${CFD_H}`}
          role="img"
          aria-label={`Накопительная диаграмма потока с ${short(points[0].date)} по ${short(last.date)}. На последний день: Todo ${last.todo}, In progress ${last.inProgress}, Done ${last.done}.`}
          {...cursor.svg}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line className={a.grid} x1={CFD_PAD.l} x2={W - CFD_PAD.r} y1={y(v)} y2={y(v)} />
              <text className={a.axis} x={CFD_PAD.l - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>
            </g>
          ))}
          <g className={a.layers}>
            <path className={a.layerDone} d={area(done.map(() => yMin), done)} />
            <path className={a.layerProgress} d={area(done, wip)} />
            <path className={a.layerTodo} d={area(wip, all)} />
            <path className={a.seam} d={line(done)} />
            <path className={a.seam} d={line(wip)} />
            <path className={a.edge} d={line(all)} />
            {nameAt(yMin, last.done, 'Done')}
            {nameAt(last.done, last.done + last.inProgress, 'In progress')}
            {nameAt(last.done + last.inProgress, total(last), 'Todo')}
          </g>
          <line className={a.base} x1={CFD_PAD.l} x2={W - CFD_PAD.r} y1={y(yMin)} y2={y(yMin)} />
          {xLabels.map((i, k) => (
            <text key={i} className={a.axis} x={x(i)} y={CFD_H - 6} textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}>{short(points[i].date)}</text>
          ))}
          {cursor.idx !== null && (
            <g pointerEvents="none">
              <line className={a.cursor} x1={x(cursor.idx)} x2={x(cursor.idx)} y1={CFD_PAD.t} y2={CFD_PAD.t + plotH} />
              {[done[cursor.idx], wip[cursor.idx], all[cursor.idx]].map((v, k) => <circle key={k} className={a.cursorDot} cx={x(cursor.idx!)} cy={y(v)} r={3.5} />)}
            </g>
          )}
        </svg>
      </div>
      <div className={a.readout} aria-live="polite">
        <span className={a.readDate}>{cursor.idx === null ? 'Сегодня' : short(shown.date)}</span>
        <span className={a.key}><i className={a.swTodo} />Todo <b>{shown.todo}</b></span>
        <span className={a.key}><i className={a.swProgress} />In progress <b>{shown.inProgress}</b></span>
        <span className={a.key}><i className={a.swDone} />Done <b>{shown.done}</b></span>
      </div>
      {yMin > 0 && <p className={a.note}>Шкала начинается с {yMin}: столько задач уже лежало в Done к {short(points[0].date)}.</p>}
    </>
  );
}

/* ───────── пропускная способность ───────── */

const TP_H = 132;

function Throughput({ data }: { data: AnalyticsView }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const buckets = data.throughput;
  const n = buckets.length;
  const pad = { t: 16, b: 20 };
  const slot = W / n;
  const barW = Math.min(30, slot * 0.62);
  const max = Math.max(1, ...buckets.map((b) => b.closed));
  const h = (v: number) => ((TP_H - pad.t - pad.b) * v) / max;
  const cursor = useCursor(n, (px) => Math.max(0, Math.min(n - 1, Math.floor(px / slot))));
  const every = n > 8 ? 2 : 1;
  const picked = cursor.idx === null ? null : buckets[cursor.idx];
  const unit = data.days === 7 ? 'день' : 'неделя';

  return (
    <>
      <div
        ref={wrapRef}
        className={a.chart}
        tabIndex={0}
        role="slider"
        aria-label={`Закрыто задач: ${unit}`}
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={cursor.idx ?? 0}
        aria-valuetext={picked ? `${range(picked.start, picked.end)}: ${picked.closed}` : 'выберите столбец'}
        onKeyDown={cursor.onKeyDown}
      >
        <svg viewBox={`0 0 ${W} ${TP_H}`} role="img" aria-label={`Закрыто задач по ${data.days === 7 ? 'дням' : 'неделям'}: ${buckets.map((b) => b.closed).join(', ')}`} {...cursor.svg}>
          <line className={a.base} x1={0} x2={W} y1={TP_H - pad.b} y2={TP_H - pad.b} />
          {buckets.map((b, i) => {
            const cx = slot * i + slot / 2;
            const bh = h(b.closed);
            const r = Math.min(4, bh, barW / 2);
            const base = TP_H - pad.b;
            return (
              <g key={b.start}>
                {b.closed > 0 && (
                  <path
                    className={cursor.idx === null || cursor.idx === i ? a.bar : a.barDim}
                    d={`M${cx - barW / 2},${base}V${base - bh + r}q0,${-r} ${r},${-r}H${cx + barW / 2 - r}q${r},0 ${r},${r}V${base}Z`}
                  />
                )}
                {(b.closed > 0 || cursor.idx === i) && <text className={a.barValue} x={cx} y={base - bh - 4}>{b.closed}</text>}
                {i % every === 0 && <text className={a.axis} x={cx} y={TP_H - 5} textAnchor="middle">{data.days === 7 ? Number(b.start.slice(8)) : short(b.start)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className={a.readout} aria-live="polite">
        {picked ? (
          <><span className={a.readDate}>{range(picked.start, picked.end)}</span><span>закрыто <b>{picked.closed}</b></span><span>{picked.stars} ★</span></>
        ) : (
          <span>Тапните столбец, чтобы увидеть {data.days === 7 ? 'день' : 'неделю'}</span>
        )}
      </div>
    </>
  );
}

/* ───────── время цикла: точечная диаграмма ───────── */

const SC_H = 190;
const SC_PAD = { l: 26, r: 30, t: 10, b: 22 };

function Scatter({ items, metric, from, to, stats, onOpenTask }: {
  items: CycleItem[]; metric: 'cycle' | 'lead'; from: string; to: string;
  stats: { p50: number | null; p85: number | null; p95: number | null; count: number };
  onOpenTask: (n: number) => void;
}) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const value = (i: CycleItem) => (metric === 'cycle' ? i.cycleDays! : i.leadDays);
  const span = Math.max(1, dayNumber(to) - dayNumber(from));
  const plotW = W - SC_PAD.l - SC_PAD.r;
  const plotH = SC_H - SC_PAD.t - SC_PAD.b;
  const yMax = Math.max(2, ...items.map(value), stats.p95 ?? 0);
  const x = (d: string) => SC_PAD.l + ((dayNumber(d) - dayNumber(from)) / span) * plotW;
  const y = (v: number) => SC_PAD.t + plotH - (v / yMax) * plotH;

  // одинаковые точки (день и длительность) раздвигаем по горизонтали, чтобы они не сливались
  const seen = new Map<string, number>();
  const pts = items.map((it) => {
    const key = `${it.doneDate}:${value(it)}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    return { it, cx: x(it.doneDate) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5, cy: y(value(it)) };
  });
  // ближайшая точка в радиусе 28 px — палец крупнее точки
  const cursor = useCursor(pts.length, (px, py) => {
    let best: number | null = null;
    let dist = 28 ** 2;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].cx - px) ** 2 + (pts[i].cy - py) ** 2;
      if (d < dist) { dist = d; best = i; }
    }
    return best;
  });

  const lines = stats.count >= MIN_SAMPLE ? ([[50, stats.p50], [85, stats.p85], [95, stats.p95]] as const) : [];
  const step = yMax <= 6 ? 1 : yMax <= 15 ? 5 : yMax <= 40 ? 10 : 20;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const picked = cursor.idx === null ? null : pts[cursor.idx]?.it;

  return (
    <>
      <div
        ref={wrapRef}
        className={a.chart}
        tabIndex={0}
        role="slider"
        aria-label="Закрытая задача на диаграмме"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, pts.length - 1)}
        aria-valuenow={cursor.idx ?? 0}
        aria-valuetext={picked ? `${ticketId(picked.number)}: ${value(picked)} дн., закрыта ${short(picked.doneDate)}` : 'выберите точку'}
        onKeyDown={cursor.onKeyDown}
      >
        <svg
          viewBox={`0 0 ${W} ${SC_H}`}
          role="img"
          aria-label={`Точечная диаграмма: ${pts.length} ${tasksWord(pts.length)}, по горизонтали дата закрытия, по вертикали дни.${stats.p85 !== null && lines.length ? ` 85% — не дольше ${stats.p85} дн.` : ''}`}
          {...cursor.svg}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line className={a.grid} x1={SC_PAD.l} x2={W - SC_PAD.r} y1={y(v)} y2={y(v)} />
              <text className={a.axis} x={SC_PAD.l - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>
            </g>
          ))}
          {lines.map(([p, v]) => v !== null && (
            <g key={p}>
              <line className={p === 85 ? `${a.pLine} ${a.pLineMain}` : a.pLine} x1={SC_PAD.l} x2={W - SC_PAD.r} y1={y(v)} y2={y(v)} />
              <text className={a.pLabel} x={W} y={y(v) + 3.5}>{p}%</text>
            </g>
          ))}
          {pts.map((p, i) => (
            <circle key={p.it.id} className={cursor.idx === i ? a.dotOn : p.it.estimated ? a.dotEst : a.dot} cx={p.cx} cy={p.cy} r={cursor.idx === i ? 5.5 : 4.5} />
          ))}
          <text className={a.axis} x={SC_PAD.l} y={SC_H - 6}>{short(from)}</text>
          <text className={a.axis} x={W - SC_PAD.r} y={SC_H - 6} textAnchor="end">{short(to)}</text>
        </svg>
      </div>
      <div className={a.picked} aria-live="polite">
        {picked ? (
          <>
            <span className={a.pickedText}><b>{ticketId(picked.number)} · {value(picked)} дн.</b> {picked.text}</span>
            <button type="button" className={a.openBtn} onClick={() => onOpenTask(picked.number)}>Открыть</button>
          </>
        ) : (
          <span className={a.pickedText}>Тапните точку, чтобы увидеть задачу. Полые точки — время оценено.</span>
        )}
      </div>
    </>
  );
}

/* ───────── экран ───────── */

export function Analytics({ chatId, title, onBack, onOpenTask }: { chatId: number; title: string; onBack: () => void; onOpenTask: (taskNumber: number) => void }) {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // варианты фильтра храним отдельно: во время перезагрузки data пустая, а ряд чипов не должен пропадать
  const [options, setOptions] = useState<AnalyticsView['assignees']>([]);
  const [metric, setMetric] = useState<'cycle' | 'lead'>('cycle');
  const [allAging, setAllAging] = useState(false);

  useEffect(() => {
    // ответ на прошлый запрос может прийти позже текущего — такой ответ отбрасываем
    let current = true;
    setError(null);
    setData(null);
    setAllAging(false);
    const filter = assignee === null ? '' : `&assignee=${encodeURIComponent(assignee)}`;
    api<AnalyticsView>(`/api/app/chats/${chatId}/analytics?days=${days}${filter}`)
      .then((d) => { if (current) { setData(d); setOptions(d.assignees); } })
      .catch((e) => current && setError(errorText(e)));
    return () => { current = false; };
  }, [chatId, days, assignee, attempt]);

  useEffect(() => {
    const back = webApp()?.BackButton;
    if (!back) return;
    back.show();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, [onBack]);

  return (
    <div className={a.root}>
      <header className={a.head}>
        <h1 className={a.title}>Аналитика</h1>
        <p className={a.sub}>{title}{data && ` · ${range(data.from, data.to)}`}</p>
      </header>

      <div className={a.periods} role="radiogroup" aria-label="Период">
        {PERIODS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={days === p} className={days === p ? a.periodOn : a.period} onClick={() => setDays(p)}>{p} дней</button>
        ))}
      </div>

      {options.length > 0 && (
        <div className={a.filters} role="group" aria-label="Фильтр по исполнителю">
          <button type="button" className={a.chip} aria-pressed={assignee === null} onClick={() => setAssignee(null)}>Все</button>
          {options.map((o) => {
            const on = assignee === o.key;
            return (
              <button key={o.key} type="button" className={o.key === 'none' ? a.chip : `${a.chip} ${a.chipAv}`} aria-pressed={on} onClick={() => setAssignee(on ? null : o.key)}>
                {o.key !== 'none' && <Avatar name={o.name} size={22} />}
                {o.key === 'none' ? o.name : o.name.split(' ')[0]}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <div className={a.error} role="alert">
          {error}
          <br />
          <button type="button" className={a.retry} onClick={() => setAttempt((n) => n + 1)}>Повторить</button>
        </div>
      ) : !data ? (
        <div aria-busy="true" aria-label="Загрузка">
          <div className={a.skelStrip} />
          <div className={a.skelChart} />
          <div className={a.skelLine} />
        </div>
      ) : data.total === 0 ? (
        <p className={a.empty}>
          {assignee === null
            ? 'На доске пока нет задач. Создайте первую в группе — аналитика начнёт считаться сразу.'
            : 'У этого исполнителя нет задач. Выберите «Все» или другого человека.'}
        </p>
      ) : (
        <Report data={data} metric={metric} setMetric={setMetric} allAging={allAging} setAllAging={setAllAging} filtered={assignee !== null} onOpenTask={onOpenTask} />
      )}
    </div>
  );
}

function Report({ data, metric, setMetric, allAging, setAllAging, filtered, onOpenTask }: {
  data: AnalyticsView; metric: 'cycle' | 'lead'; setMetric: (m: 'cycle' | 'lead') => void;
  allAging: boolean; setAllAging: (v: boolean) => void; filtered: boolean; onOpenTask: (n: number) => void;
}) {
  const { kpi, cfd, cycle, wip, blocks, deadlines } = data;
  const closed = kpi.closed.value ?? 0;
  const stats = metric === 'cycle' ? cycle.cycle : cycle.lead;
  const scatterItems = metric === 'cycle' ? cycle.items.filter((i) => i.cycleDays !== null) : cycle.items;
  const aging = allAging ? wip.aging : wip.aging.slice(0, AGING_VISIBLE);
  const agingScale = Math.max(wip.sle * 1.5, ...wip.aging.map((i) => i.ageDays));
  const prevLabel = `прошлые ${data.days} дней`;

  return (
    <>
      <div className={a.summary}>
        <div className={a.stat}>
          <span className={a.statLabel}>Завершено</span>
          <span className={a.statValue}>{closed}</span>
          <Delta kpi={kpi.closed} />
        </div>
        <div className={a.stat}>
          <span className={a.statLabel}>Цикл, медиана</span>
          <span className={a.statValue}>{kpi.cycleP50.value ?? '—'}{kpi.cycleP50.value !== null && <span className={a.statUnit}>дн</span>}</span>
          <Delta kpi={kpi.cycleP50} lowerIsBetter unit=" дн" />
        </div>
        <div className={a.stat}>
          <span className={a.statLabel}>В работе</span>
          <span className={a.statValue}>{wip.now}</span>
          <span className={a.statSub}>очередь {wip.queue}</span>
        </div>
        <div className={a.stat}>
          <span className={a.statLabel}>В срок</span>
          <span className={a.statValue}>{kpi.onTime.value ?? '—'}{kpi.onTime.value !== null && <span className={a.statUnit}>%</span>}</span>
          <Delta kpi={kpi.onTime} unit=" п.п." />
        </div>
      </div>
      <p className={a.note}>Стрелки — сравнение с периодом той же длины до этого ({prevLabel}).</p>

      {/* главный экран — CFD */}
      <section className={a.hero} aria-labelledby="an-cfd">
        <div className={a.h2Row}>
          <h2 id="an-cfd" className={a.heroH2}>Поток задач</h2>
          <Term label="Что такое CFD">Накопительная диаграмма потока: сколько задач лежало в каждой колонке на конец каждого дня.</Term>
        </div>
        <Cfd points={cfd.points} />

        <dl className={a.facts}>
          <div className={a.fact}>
            <dt className={a.factLabel}>WIP в среднем</dt>
            <dd className={a.factValue}>{num(cfd.avgWip)}</dd>
          </div>
          <div className={a.fact}>
            <dt className={a.factLabel}>Закрываем в неделю</dt>
            <dd className={a.factValue}>{num(cfd.throughputPerWeek)}</dd>
          </div>
          <div className={a.fact}>
            <dt className={a.factLabel}>Цикл по Литтлу</dt>
            <dd className={a.factValue}>{cfd.littleDays === null ? '—' : `≈ ${num(cfd.littleDays)} дн`}</dd>
          </div>
        </dl>
        <div className={a.h2Row}>
          <Term label="WIP">Work in progress — задачи в колонке In progress. Чем их меньше одновременно, тем быстрее каждая доходит до Done.</Term>
          <Term label="Закон Литтла">Среднее время цикла ≈ средний WIP ÷ сколько задач закрываем в день. Грубая оценка без учёта отдельных задач.</Term>
        </div>

        {cfd.signals.length > 0 && (
          <ul className={a.signals}>{cfd.signals.map((s) => <li key={s} className={a.signal}>{SIGNALS[s]}</li>)}</ul>
        )}

        <details className={a.howto}>
          <summary>Как читать диаграмму</summary>
          <ul>
            <li>Верхняя граница — все задачи на доске. Её подъём — приток новых задач.</li>
            <li>Граница слоя Done — сколько закрыто. Чем круче она растёт, тем выше пропускная способность.</li>
            <li>Ширина полосы In progress по вертикали — WIP. Расширяется — берём больше, чем успеваем закончить.</li>
            <li>Полоса Todo — очередь. Ширина по горизонтали между линиями — примерное время, которое задача проводит в колонке.</li>
            <li>Плоская линия Done — работа не завершается: ищите блокировки и зависшие карточки ниже.</li>
          </ul>
        </details>
      </section>

      <section className={a.section} aria-labelledby="an-tp">
        <div className={a.h2Row}>
          <h2 id="an-tp" className={a.h2}>Пропускная способность</h2>
          <Term label="Что это">Сколько задач закрыто за {data.days === 7 ? 'день' : 'неделю'}. Звёзды — суммарная сложность закрытого.</Term>
        </div>
        <p className={a.lead}>
          {closed} {tasksWord(closed)} и {kpi.stars.value} ★ за {data.days} дней · было {kpi.closed.prev} и {kpi.stars.prev} ★
        </p>
        {closed === 0 ? (
          <p className={a.empty}>За этот период ничего не закрыто. Перенесите готовые задачи в Done — здесь появятся столбцы.</p>
        ) : (
          <Throughput data={data} />
        )}
      </section>

      <section className={a.section} aria-labelledby="an-cycle">
        <div className={a.h2Row}>
          <h2 id="an-cycle" className={a.h2}>Сколько занимает задача</h2>
          <Term label="Цикл и срок">Время цикла — дни от первого входа в In progress до Done. Срок выполнения — от создания до Done. День начала и день закрытия считаются оба.</Term>
          <Term label="SLE">Ожидаемый срок: 85% задач закрываются не дольше этого числа дней. На него можно опираться, когда спрашивают «когда будет готово».</Term>
        </div>
        <div className={a.toggle} role="group" aria-label="Что считать">
          <button type="button" className={a.toggleBtn} aria-pressed={metric === 'cycle'} onClick={() => setMetric('cycle')}>Время цикла</button>
          <button type="button" className={a.toggleBtn} aria-pressed={metric === 'lead'} onClick={() => setMetric('lead')}>Срок выполнения</button>
        </div>
        {stats.count >= MIN_SAMPLE ? (
          <>
            <p className={a.sle}>85% задач — за <b>{stats.p85}</b> дн. или быстрее</p>
            <div className={a.pcts}>
              <span>50% — <b>{stats.p50}</b> дн</span>
              <span>85% — <b>{stats.p85}</b> дн</span>
              <span>95% — <b>{stats.p95}</b> дн</span>
            </div>
          </>
        ) : stats.count > 0 ? (
          <p className={a.lead}>Медиана — {stats.p50} дн. Перцентили считаем от {MIN_SAMPLE} задач, сейчас {stats.count}.</p>
        ) : null}
        {scatterItems.length === 0 ? (
          <p className={a.empty}>
            {metric === 'cycle' && cycle.items.length > 0
              ? 'Закрытые задачи не проходили через In progress — время цикла не посчитать. Переносите задачи в работу перед закрытием или смотрите срок выполнения.'
              : 'За период ничего не закрыто — точкам неоткуда взяться.'}
          </p>
        ) : (
          <Scatter key={metric} items={scatterItems} metric={metric} from={data.from} to={data.to} stats={stats} onOpenTask={onOpenTask} />
        )}
        {metric === 'cycle' && cycle.withoutProgress > 0 && (
          <p className={a.note}>
            {cycle.withoutProgress} {tasksWord(cycle.withoutProgress)} закрыто минуя In progress или без истории входа в работу — для них считаем только срок выполнения.
          </p>
        )}
      </section>

      <section className={a.section} aria-labelledby="an-wip">
        <div className={a.h2Row}>
          <h2 id="an-wip" className={a.h2}>В работе сейчас: {wip.now}</h2>
          <Term label="Возраст">Сколько дней карточка в In progress с последнего входа в колонку. Метка на полосе — порог: дольше него задача уже необычно долгая.</Term>
        </div>
        <p className={a.lead}>
          {wip.sleFromData
            ? `Порог — ${wip.sle} дн.: 85% задач за период закрыты быстрее.`
            : `Порог — ${wip.sle} дн. по умолчанию: для расчёта по данным нужно ${MIN_SAMPLE} задач с известным временем цикла.`}
        </p>
        {wip.aging.length === 0 ? (
          <p className={a.empty}>Сейчас ничего не в работе. Перенесите задачу в In progress, когда начнёте её делать.</p>
        ) : (
          <div className={a.list}>
            {aging.map((it) => (
              <button key={it.id} type="button" className={a.row} onClick={() => onOpenTask(it.number)} aria-label={`${ticketId(it.number)}: ${it.text}. В работе ${it.ageDays} дн.${it.overSle ? ', дольше порога' : ''}${it.blocked ? ', заблокирована' : ''}`}>
                <span className={a.rowId}>{ticketId(it.number)}</span>
                <span className={a.rowText}>{it.text}</span>
                <span className={it.overSle ? a.rowAgeOver : a.rowAge}>{it.estimated ? '≈' : ''}{it.ageDays} дн</span>
                <span className={a.rowMeta}>
                  <span className={a.track} aria-hidden="true">
                    <span className={it.overSle ? a.fillOver : a.fill} style={{ width: `${Math.min(100, (it.ageDays / agingScale) * 100)}%` }} />
                    <span className={a.tick} style={{ left: `${(wip.sle / agingScale) * 100}%` }} />
                  </span>
                  {it.blocked && <span className={a.tag}>блок</span>}
                  {it.assignees.length > 0 && <span className={a.who}>{it.assignees.join(', ')}</span>}
                </span>
              </button>
            ))}
            {wip.aging.length > AGING_VISIBLE && (
              <button type="button" className={a.more} onClick={() => setAllAging(!allAging)}>
                {allAging ? 'Свернуть' : `Показать все (${wip.aging.length})`}
              </button>
            )}
          </div>
        )}
        {wip.aging.some((i) => i.estimated) && <p className={a.note}>≈ — карточка в работе с тех пор, как журнала ещё не было; возраст считаем от создания.</p>}
      </section>

      <section className={a.section} aria-labelledby="an-blocks">
        <h2 id="an-blocks" className={a.h2}>Блокировки</h2>
        <div className={a.pair}>
          <div>
            <span className={blocks.now.length ? a.pairDanger : a.pairValue}>{blocks.now.length}</span>
            <span className={a.pairLabel}>заблокировано сейчас</span>
          </div>
          <div>
            <span className={a.pairValue}>{blocks.share === null ? '—' : blocks.share > 0 && blocks.share < 0.01 ? '<1%' : `${Math.round(blocks.share * 100)}%`}</span>
            <span className={a.pairLabel}>времени задачи простояли в блоке за период</span>
          </div>
        </div>
        {blocks.now.length > 0 && (
          <div className={a.list}>
            {blocks.now.map((b) => (
              <button key={b.id} type="button" className={a.row} onClick={() => onOpenTask(b.number)}>
                <span className={a.rowId}>{ticketId(b.number)}</span>
                <span className={a.rowText}>{b.text}</span>
                <span className={a.rowAge}>{b.days === null ? 'давно' : `${b.days} дн`}</span>
              </button>
            ))}
          </div>
        )}
        <p className={a.note}>
          {blocks.tasks > 0 ? `За период блокировались ${blocks.tasks} ${tasksWord(blocks.tasks)}. ` : 'За период блокировок не было. '}
          Доля — от времени, пока задачи были открыты (Todo и In progress).
          {blocks.unknownStart > 0 && ` У ${blocks.unknownStart} блокировок нет даты начала — в долю они не вошли.`}
        </p>
      </section>

      <section className={a.section} aria-labelledby="an-deadlines">
        <h2 id="an-deadlines" className={a.h2}>Сроки</h2>
        <div className={a.pair}>
          <div>
            <span className={a.pairValue}>{kpi.onTime.value === null ? '—' : `${kpi.onTime.value}%`}</span>
            <span className={a.pairLabel}>
              {deadlines.closed > 0 ? `закрыто в срок: ${deadlines.onTime} из ${deadlines.closed}` : 'закрытых за период нет'}
            </span>
          </div>
          <div>
            <span className={deadlines.overdueOpen ? a.pairDanger : a.pairValue}>{deadlines.overdueOpen}</span>
            <span className={a.pairLabel}>открытых задач просрочено сейчас</span>
          </div>
        </div>
      </section>

      {!filtered && data.people.length > 0 && (
        <section className={a.section} aria-labelledby="an-people">
          <h2 id="an-people" className={a.h2}>Нагрузка по людям</h2>
          <table className={a.people}>
            <thead>
              <tr><th scope="col">Исполнитель</th><th scope="col" className={a.num}>Закрыто</th><th scope="col" className={a.num}>★</th><th scope="col" className={a.num}>В работе</th></tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.key}>
                  <td>
                    <span className={a.person}>
                      {p.key === 'none' ? <span className={a.noAvatar} aria-hidden="true">—</span> : <Avatar name={p.name} size={24} />}
                      <span className={a.personName}>{p.name}</span>
                    </span>
                  </td>
                  <td>{p.closed}</td>
                  <td>{p.stars}</td>
                  <td>{p.wip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={a.note}>Задача с несколькими исполнителями учитывается у каждого.</p>
        </section>
      )}

      <p className={a.note}>
        Удалённые задачи в аналитику не попадают.
        {cycle.estimated > 0 && ` У ${cycle.estimated} ${plural(cycle.estimated, 'закрытой задачи', 'закрытых задач', 'закрытых задач')} нет полной истории переходов (созданы до журнала) — их время оценено.`}
      </p>
    </>
  );
}
