'use client';
import { useEffect, useState } from 'react';
import type { AnalyticsDays, AnalyticsView, Kpi } from '@/domain/types';
import { api, errorText } from './api';
import { Avatar } from './Avatar';
import { webApp } from './telegram';
import s from './miniapp.module.css';

const PERIODS: AnalyticsDays[] = [7, 30, 90];
const STAR_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const ddmm = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}`;
const range = (a: string, b: string) => (a === b ? short(a) : `${short(a)} – ${short(b)}`);
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

function Delta({ kpi, unit = '' }: { kpi: Kpi; unit?: string }) {
  if (kpi.value === null || kpi.prev === null || kpi.prev === 0) return <span className={s.kpiDeltaMuted}>—</span>;
  const d = kpi.value - kpi.prev;
  if (d === 0) return <span className={s.kpiDeltaMuted}>±0</span>;
  return <span className={d > 0 ? s.kpiDeltaUp : s.kpiDeltaDown}>{d > 0 ? '+' : '−'}{Math.abs(d)}{unit}</span>;
}

function StackBar({ byStars, total, vertical }: { byStars: number[]; total: number; vertical?: boolean }) {
  return (
    <div className={vertical ? s.stackV : s.stackH}>
      {byStars.map((n, i) => n > 0 && (
        <span key={i} style={{ [vertical ? 'height' : 'width']: `${(n / total) * 100}%`, background: STAR_COLORS[i] }} />
      ))}
    </div>
  );
}

export function Analytics({ chatId, title, onBack }: { chatId: number; title: string; onBack: () => void }) {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [assignee, setAssignee] = useState<string | null>(null);
  // варианты фильтра храним отдельно: при перезагрузке data пустая, а ряд чипов не должен пропадать
  const [options, setOptions] = useState<AnalyticsView['assignees']>([]);

  useEffect(() => {
    // ответ на прошлый период может прийти позже текущего — такой ответ отбрасываем
    let current = true;
    setPicked(null);
    setError(null);
    setData(null);
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

  const maxBucket = data ? Math.max(1, ...data.buckets.map((b) => b.byStars.reduce((a, n) => a + n, 0))) : 1;
  const maxStarRow = data ? Math.max(1, ...data.byStars.map((r) => r.closed)) : 1;
  const maxPerson = data ? Math.max(1, ...data.people.map((p) => p.closed)) : 1;
  const bucket = data && picked !== null ? data.buckets[picked] : null;

  return (
    <div className={s.analytics}>
      <header className={s.anHead}>
        <div className={s.anTitles}>
          <h1 className={s.title}>Аналитика</h1>
          <span className={s.muted}>{title}</span>
        </div>
        <div className={s.seg} role="radiogroup" aria-label="Период">
          {PERIODS.map((p) => (
            <button key={p} role="radio" aria-checked={days === p} className={days === p ? s.segOn_todo : s.segBtn} onClick={() => setDays(p)}>{p} дн</button>
          ))}
        </div>
      </header>

      {options.length > 0 && (
        <div className={s.anFilters} role="group" aria-label="Фильтр по исполнителю">
          <button className={assignee === null ? s.filterOn : s.filter} aria-pressed={assignee === null} onClick={() => setAssignee(null)}>Все</button>
          {options.map((o) => {
            const on = assignee === o.key;
            const pick = () => setAssignee(on ? null : o.key);
            return o.key === 'none' ? (
              <button key={o.key} className={on ? s.filterOn : s.filter} aria-pressed={on} onClick={pick}>{o.name}</button>
            ) : (
              <button key={o.key} className={on ? s.filterAvOn : s.filterAv} aria-pressed={on} onClick={pick}><Avatar name={o.name} size={24} />{o.name.split(' ')[0]}</button>
            );
          })}
        </div>
      )}

      {error && (
        <div className={s.center}>{error}<br /><button className={s.chipBtn} onClick={() => setAttempt((n) => n + 1)}>Повторить</button></div>
      )}
      {!error && !data && <div className={s.skeletons} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className={s.skel} />)}</div>}

      {data && !error && (
        <>
          <div className={s.kpis}>
            <div className={s.kpi}><span className={s.kpiLabel}>Закрыто</span><span className={s.kpiValue}>{data.kpi.closed.value}</span><Delta kpi={data.kpi.closed} /></div>
            <div className={s.kpi}><span className={s.kpiLabel}>Звёзды</span><span className={s.kpiValue}>{data.kpi.stars.value}</span><Delta kpi={data.kpi.stars} /></div>
            <div className={s.kpi}><span className={s.kpiLabel}>Вовремя</span><span className={s.kpiValue}>{data.kpi.onTime.value === null ? '—' : `${data.kpi.onTime.value}%`}</span><Delta kpi={data.kpi.onTime} unit="%" /></div>
          </div>

          {data.kpi.closed.value === 0 ? (
            <div className={s.anEmpty}>За этот период закрытых задач нет</div>
          ) : (
            <>
              <section className={s.anCard}>
                <h2 className={s.anH2}>Темп</h2>
                <div className={s.chart}>
                  {data.buckets.map((b, i) => {
                    const total = b.byStars.reduce((a, n) => a + n, 0);
                    return (
                      <button key={b.start} className={picked === i ? s.barColOn : s.barCol} aria-label={`${range(b.start, b.end)}: ${total}`} onClick={() => setPicked(picked === i ? null : i)}>
                        <span className={s.colTrack} style={{ height: `${(total / maxBucket) * 100}%` }}>
                          {total > 0 && <StackBar byStars={b.byStars} total={total} vertical />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className={s.axis}>
                  {data.buckets.map((b, i) => (
                    <span key={b.start}>{i % (data.buckets.length > 8 ? 2 : 1) === 0 ? ddmm(b.start) : ''}</span>
                  ))}
                </div>
                {bucket ? (
                  <div className={s.pickedInfo}>
                    <b>{range(bucket.start, bucket.end)}</b>
                    {bucket.byStars.map((n, i) => n > 0 && <span key={i} className={s.legendItem}><i style={{ background: STAR_COLORS[i] }} />★{i + 1}: {n}</span>)}
                    {bucket.byStars.every((n) => n === 0) && <span className={s.muted}>ничего не закрыто</span>}
                  </div>
                ) : (
                  <div className={s.legend}>{STAR_COLORS.map((c, i) => <span key={i} className={s.legendItem}><i style={{ background: c }} />★{i + 1}</span>)}</div>
                )}
              </section>

              <section className={s.anCard}>
                <h2 className={s.anH2}>По сложности</h2>
                {data.byStars.map((r) => (
                  <div key={r.stars} className={s.starRow}>
                    <span className={s.starLabel}>★{r.stars}</span>
                    <span className={s.barTrack}><span style={{ width: `${(r.closed / maxStarRow) * 100}%`, background: STAR_COLORS[r.stars - 1] }} /></span>
                    <span className={s.starNum}>{r.closed}</span>
                    <span className={s.starDays}>{r.medianDays === null ? '—' : `${String(r.medianDays).replace('.', ',')} дн`}</span>
                  </div>
                ))}
                <p className={s.anNote}>Справа — медиана дней от создания до закрытия</p>
              </section>

              {assignee === null && <section className={s.anCard}>
                <h2 className={s.anH2}>По людям</h2>
                {data.people.map((p) => (
                  <div key={p.key} className={s.personRow}>
                    {p.key === 'none' ? <span className={s.noAvatar} aria-hidden="true">—</span> : <Avatar name={p.name} size={28} />}
                    <div className={s.personBody}>
                      <div className={s.personHead}>
                        <span className={s.personName}>{p.name}</span>
                        <span className={s.muted}>{p.closed} {plural(p.closed, 'задача', 'задачи', 'задач')} · {p.stars} ★</span>
                      </div>
                      <span className={s.barTrack}><span style={{ width: `${(p.closed / maxPerson) * 100}%`, display: 'flex' }}><StackBar byStars={p.byStars} total={p.closed} /></span></span>
                    </div>
                  </div>
                ))}
                <p className={s.anNote}>Задача с несколькими исполнителями учитывается у каждого</p>
              </section>}
            </>
          )}
        </>
      )}
    </div>
  );
}
