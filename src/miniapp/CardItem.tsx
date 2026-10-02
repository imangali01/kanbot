'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { deadlineState, formatDateRu } from '@/domain/dates';
import type { CardView } from '@/domain/types';
import s from './miniapp.module.css';

function initials(name: string): string {
  return name.replace('@', '').split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function CardBody({ card }: { card: CardView }) {
  const state = deadlineState(card.deadline, new Date());
  const deadlineClass = state === 'overdue' ? s.deadlineOverdue : state === 'today' ? s.deadlineToday : s.deadline;
  return (
    <>
      <div className={s.cardNum}>#{card.number}</div>
      <div className={s.cardText}>{card.text}</div>
      <div className={s.cardMeta}>
        <span className={s.stars}>{'★'.repeat(card.stars)}</span>
        <span className={deadlineClass}>{formatDateRu(card.deadline)}</span>
        {card.blocked && <span className={s.blockedTag}>⛔</span>}
        <span className={s.avatars}>
          {card.assignees.slice(0, 3).map((a) => (
            <span key={a.key} className={s.avatar} title={a.name}>{initials(a.name)}</span>
          ))}
        </span>
      </div>
    </>
  );
}

export function CardItem({ card, onOpen }: { card: CardView; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !card.canEdit });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${card.blocked ? s.cardBlocked : s.card} ${isDragging ? s.cardGhost : ''}`}
      onClick={() => onOpen(card.id)}
      {...attributes}
      {...listeners}
    >
      <CardBody card={card} />
    </div>
  );
}

export function CardOverlay({ card }: { card: CardView }) {
  return (
    <div className={s.cardOverlay}>
      <CardBody card={card} />
    </div>
  );
}
