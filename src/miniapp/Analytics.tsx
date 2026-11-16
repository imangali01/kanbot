'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ticketId } from '@/domain/ticketId';
import type { AnalyticsDays, AnalyticsView, CfdPoint, FlowSignal, Kpi } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { webApp } from './telegram';
import a from './analytics.module.css';

const PERIODS: AnalyticsDays[] = [7, 30, 90];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const AGING_VISIBLE = 5;

const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const range = (from: string, to: string) => (from === to ? short(from) : `${short(from)} – ${short(to)}`);
const num = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

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
  // плавные кривые: горизонтальные касательные в узлах не дают слоям пересекаться
  const seg = (vs: number[], i: number) => {
    const mx = (x(i - 1) + x(i)) / 2;
    return `C${mx.toFixed(1)},${y(vs[i - 1]).toFixed(1)} ${mx.toFixed(1)},${y(vs[i]).toFixed(1)} ${x(i).toFixed(1)},${y(vs[i]).toFixed(1)}`;
  };
  const line = (vs: number[]) => vs.map((v, i) => (i ? seg(vs, i) : `M${x(0).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const back = (vs: number[]) => {
    let d = `L${x(n - 1).toFixed(1)},${y(vs[n - 1]).toFixed(1)}`;
    for (let i = n - 1; i > 0; i--) {
      const mx = (x(i - 1) + x(i)) / 2;
      d += `C${mx.toFixed(1)},${y(vs[i]).toFixed(1)} ${mx.toFixed(1)},${y(vs[i - 1]).toFixed(1)} ${x(i - 1).toFixed(1)},${y(vs[i - 1]).toFixed(1)}`;
    }
    return d;
  };
  const area = (lo: number[], hi: number[]) => `${line(hi)}${back(lo)}Z`;
  const gid = useId().replace(/:/g, '');

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
          <defs>
            {([['d', 'done'], ['p', 'progress'], ['t', 'todo']] as const).map(([k, c]) => (
              <linearGradient key={k} id={`${gid}${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: `var(--st-${c})`, stopOpacity: 0.95 }} />
                <stop offset="1" style={{ stopColor: `var(--st-${c})`, stopOpacity: 0.55 }} />
              </linearGradient>
            ))}
          </defs>
          <g className={a.layers}>
            <path d={area(done.map(() => yMin), done)} fill={`url(#${gid}d)`} />
            <path d={area(done, wip)} fill={`url(#${gid}p)`} />
            <path d={area(wip, all)} fill={`url(#${gid}t)`} />
            <path className={a.lineDone} d={line(done)} />
            <path className={a.lineProgress} d={line(wip)} />
            <path className={a.lineTodo} d={line(all)} />
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

/* ───────── экран ───────── */

export function Analytics({ chatId, title, onBack, onOpenTask }: { chatId: number; title: string; onBack: () => void; onOpenTask: (taskNumber: number) => void }) {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // варианты фильтра храним отдельно: во время перезагрузки data пустая, а ряд чипов не должен пропадать
  const [options, setOptions] = useState<AnalyticsView['assignees']>([]);
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
        <Report data={data} allAging={allAging} setAllAging={setAllAging} filtered={assignee !== null} onOpenTask={onOpenTask} />
      )}
    </div>
  );
}

function Report({ data, allAging, setAllAging, filtered, onOpenTask }: {
  data: AnalyticsView; allAging: boolean; setAllAging: (v: boolean) => void; filtered: boolean; onOpenTask: (n: number) => void;
}) {
  const { kpi, cfd, cycle, wip, blocks } = data;
  const aging = allAging ? wip.aging : wip.aging.slice(0, AGING_VISIBLE);
  const p = cycle.cycle;

  return (
    <>
      <div className={a.summary}>
        <div className={a.stat}>
          <span className={a.statLabel}>Завершено</span>
          <span className={a.statValue}>{kpi.closed.value ?? 0}</span>
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

      <section className={a.hero} aria-labelledby="an-cfd">
        <h2 id="an-cfd" className={a.heroH2}>Поток задач</h2>
        <Cfd points={cfd.points} />
        {cfd.signals.length > 0 && <p className={a.note}>{SIGNALS[cfd.signals[0]]}</p>}
        {p.count > 0 && (
          <p className={a.note}>
            Задачи закрываются за {p.p50} дн. (половина) и за {p.p85} дн. (85%).
          </p>
        )}
      </section>

      {(wip.aging.length > 0 || blocks.now.length > 0) && (
        <section className={a.section} aria-labelledby="an-wip">
          <h2 id="an-wip" className={a.h2}>Требуют внимания</h2>
          <div className={a.list}>
            {blocks.now.map((b) => (
              <button key={`b${b.id}`} type="button" className={a.row} onClick={() => onOpenTask(b.number)}>
                <span className={a.rowId}>{ticketId(b.number)}</span>
                <span className={a.rowText}>{b.text}</span>
                <span className={a.rowAgeOver}>блок</span>
              </button>
            ))}
            {aging.map((it) => (
              <button key={it.id} type="button" className={a.row} onClick={() => onOpenTask(it.number)}>
                <span className={a.rowId}>{ticketId(it.number)}</span>
                <span className={a.rowText}>{it.text}</span>
                <span className={it.overSle ? a.rowAgeOver : a.rowAge}>{it.estimated ? '≈' : ''}{it.ageDays} дн</span>
              </button>
            ))}
            {wip.aging.length > AGING_VISIBLE && (
              <button type="button" className={a.more} onClick={() => setAllAging(!allAging)}>
                {allAging ? 'Свернуть' : `Показать все (${wip.aging.length})`}
              </button>
            )}
          </div>
        </section>
      )}

      {!filtered && data.people.length > 1 && (
        <section className={a.section} aria-labelledby="an-people">
          <h2 id="an-people" className={a.h2}>Нагрузка по людям</h2>
          <table className={a.people}>
            <thead>
              <tr><th scope="col">Исполнитель</th><th scope="col" className={a.num}>Закрыто</th><th scope="col" className={a.num}>В работе</th></tr>
            </thead>
            <tbody>
              {data.people.map((x) => (
                <tr key={x.key}>
                  <td>
                    <span className={a.person}>
                      {x.key === 'none' ? <span className={a.noAvatar} aria-hidden="true">—</span> : <Avatar name={x.name} size={24} />}
                      <span className={a.personName}>{x.name}</span>
                    </span>
                  </td>
                  <td>{x.closed}</td>
                  <td>{x.wip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
