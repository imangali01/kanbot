'use client';
import { useState } from 'react';
import { DISPLAY_NAME_MAX } from '@/domain/displayName';
import type { SortMode } from '@/domain/types';
import { IconCheck, IconRefresh } from './icons';
import { Sheet } from './Sheet';
import type { BoardPrefs } from './prefs';
import s from './miniapp.module.css';

export const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Свой порядок',
  created: 'Сначала новые',
  stars: 'Сначала сложные',
  deadline: 'По сроку',
};

export function OptionsSheet({ prefs, onChange, onClose, myName, onRename, onRefresh }: { prefs: BoardPrefs; onChange: (p: BoardPrefs) => void; onClose: () => void; myName: string; onRename: (name: string) => Promise<void>; onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState(myName);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await onRename(name); } finally { setSaving(false); }
  };
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
      <div className={s.optSep} />
      <button
        className={s.opt}
        disabled={refreshing}
        onClick={async () => { setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } }}
      >
        <span>{refreshing ? 'Обновляю…' : 'Обновить доску'}</span>
        <span className={refreshing ? s.spin : undefined}><IconRefresh size={18} /></span>
      </button>
      <p className={s.optHint}>Доска обновляется сама, когда кто-то меняет карточки. Кнопка нужна, если связь пропадала.</p>
      <div className={s.optSep} />
      <label className={s.optHint} htmlFor="my-name">Моё имя на доске</label>
      <div className={s.nameRow}>
        <input id="my-name" className={s.nameInput} value={name} maxLength={DISPLAY_NAME_MAX} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
        <button className={s.nameSave} disabled={saving || name.trim() === myName} onClick={() => void save()}>Сохранить</button>
      </div>
      <p className={s.optHint}>Видно всем в группе. Пустое поле вернёт имя из Telegram.</p>
    </Sheet>
  );
}
