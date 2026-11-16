'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AGING_WARN_DAYS, daysInProgress } from '@/domain/board';
import { daysUntil, deadlineLabel } from '@/domain/dates';
import { ticketId } from '@/domain/ticketId';
import type { CardView } from '@/domain/types';
import { Avatar } from './Avatar';
import { IconLock, IconStar } from './icons';
import s from './miniapp.module.css';

export function CardBody({ card }: { card: CardView }) {
  const now = new Date();
  const days = daysUntil(card.deadline, now);
  const dueClass = card.status === 'done' ? s.pill : days < 0 ? s.pillOverdue : days === 0 ? s.pillToday : s.pill;
  const age = daysInProgress(card, now);
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
        <span className={dueClass}>{deadlineLabel(card.deadline, now, card.status === 'done' ? card.doneAt : null)}</span>
        <span className={s.starChip} aria-label={`Сложность ${card.stars} из 5`}>
          <IconStar size={12} filled />
          {card.stars}
        </span>
        {age !== null && (
          <span className={age >= AGING_WARN_DAYS ? s.pillAging : s.pill} title="Сколько карточка уже в работе">
            {age === 0 ? 'взято сегодня' : `в работе ${age} дн.`}
          </span>
        )}
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !card.canMove });
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
