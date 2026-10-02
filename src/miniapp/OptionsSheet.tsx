'use client';
import type { SortMode } from '@/domain/types';
import { IconCheck } from './icons';
import { Sheet } from './Sheet';
import type { BoardPrefs } from './prefs';
import s from './miniapp.module.css';

export const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Свой порядок',
  created: 'Сначала новые',
  stars: 'Сначала сложные',
  deadline: 'По сроку',
};

export function OptionsSheet({ prefs, onChange, onClose }: { prefs: BoardPrefs; onChange: (p: BoardPrefs) => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Настройки доски">
      <h2 className={s.sheetTitle}>Порядок карточек</h2>
      <div className={s.optGroup} role="radiogroup" aria-label="Порядок карточек">
        {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
          <button key={m} className={s.opt} role="radio" aria-checked={prefs.sort === m} onClick={() => onChange({ ...prefs, sort: m })}>
            <span>{SORT_LABELS[m]}</span>
            {prefs.sort === m && <span className={s.optCheck}><IconCheck size={20} /></span>}
          </button>
        ))}
      </div>
      <p className={s.optHint}>
        {prefs.sort === 'manual' ? 'Порядок общий для всей группы: перетаскивайте карточки внутри колонки.' : 'Пока выбрана сортировка, карточки внутри колонки не перетаскиваются, а между колонками можно.'}
      </p>
      <div className={s.optSep} />
      <button className={s.opt} role="switch" aria-checked={prefs.showAll} onClick={() => onChange({ ...prefs, showAll: !prefs.showAll })}>
        <span>Показывать старые задачи</span>
        <span className={prefs.showAll ? s.switchOn : s.switch} />
      </button>
      <p className={s.optHint}>Выполненные больше 30 дней назад скрыты, чтобы колонка Done не разрасталась.</p>
    </Sheet>
  );
}
