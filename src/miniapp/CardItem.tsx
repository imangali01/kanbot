'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { daysUntil, deadlineLabel } from '@/domain/dates';
import { ticketId } from '@/domain/ticketId';
import type { CardView } from '@/domain/types';
import { Avatar } from './Avatar';
import { IconLock, IconStar } from './icons';
import s from './miniapp.module.css';

export function CardBody({ card }: { card: CardView }) {
  const now = new Date();
  const days = daysUntil(card.deadline, now);
  const dueClass = card.status === 'done' ? s.due : days < 0 ? s.dueOverdue : days === 0 ? s.dueToday : s.due;
  return (
    <>
      <div className={s.cardNum}>{ticketId(card.number)}</div>
      <p className={s.cardText}>{card.text}</p>
      {card.blocked && (
        <div className={s.reason}>
          <IconLock size={14} />
          <span className={s.reasonText}>{card.blockedReason}</span>
        </div>
      )}
      <div className={s.cardMeta}>
        <span className={s.stars} aria-label={`Сложность ${card.stars} из 5`}>
          {Array.from({ length: card.stars }, (_, i) => <IconStar key={i} size={13} filled />)}
        </span>
        <span className={dueClass}>{deadlineLabel(card.deadline, now)}</span>
        {card.assignees.length > 0 && (
          <span className={s.avatars}>
            {card.assignees.slice(0, 3).map((a) => <Avatar key={a.key} name={a.name} stacked />)}
          </span>
        )}
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
