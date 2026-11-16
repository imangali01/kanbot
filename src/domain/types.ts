export type Status = 'todo' | 'in_progress' | 'done';
export const STATUSES: Status[] = ['todo', 'in_progress', 'done'];
export const STATUS_TITLES: Record<Status, string> = { todo: 'Todo', in_progress: 'In progress', done: 'Done' };

export type SortMode = 'manual' | 'created' | 'stars' | 'deadline';

export interface AssigneeView { key: string; userId: number | null; username: string | null; name: string }

export interface CardView {
  id: number;
  number: number;
  text: string;
  status: Status;
  position: number;
  stars: number;
  deadline: string;
  blocked: boolean;
  blockedReason: string | null;
  createdAt: string;
  doneAt: string | null;
  /** Когда карточку последний раз взяли в работу (для «в работе N дн.»); null — не в работе или нет истории. */
  inProgressSince: string | null;
  authorId: number;
  authorName: string;
  assignees: AssigneeView[];
  canEdit: boolean;
  canMove: boolean;
  canEditText: boolean;
  canDelete: boolean;
  canChangeAuthor: boolean;
}

export interface BoardView {
  chat: { id: number; title: string; type: string };
  me: { userId: number; canCreate: boolean };
  members: AssigneeView[];
  cards: CardView[];
  /** Меняется при любом изменении доски: клиент по нему понимает, что пора перезагрузиться. */
  version: string;
}

export interface CommentView { id: number; kind: 'comment' | 'system'; text: string; authorName: string | null; createdAt: string }
export interface HistoryItem {
  id: string;
  kind: 'event' | 'comment';
  actorName: string | null;
  text: string;
  createdAt: string;
}
export interface AttachmentView {
  id: number;
  kind: 'photo' | 'video' | 'animation' | 'audio' | 'voice' | 'document';
  name: string | null;
  mime: string | null;
  size: number | null;
}
export interface TaskDetail { card: CardView; description: string | null; comments: CommentView[]; attachments: AttachmentView[] }
export interface ChatSummary { id: number; title: string }

export type AnalyticsDays = 7 | 30 | 90;
export interface Kpi { value: number | null; prev: number | null }
/** Состояние доски на конец дня (Asia/Almaty): сколько задач в каждой колонке. */
export interface CfdPoint { date: string; todo: number; inProgress: number; done: number }
export type FlowSignal = 'doneFlat' | 'doneDrops' | 'wipGrowing' | 'queueGrowing' | 'queueShrinking' | 'steady';
export interface ThroughputBucket { start: string; end: string; closed: number; stars: number }
/** Перцентили в днях (nearest-rank); null — нет данных. */
export interface TimeStats { count: number; p50: number | null; p85: number | null; p95: number | null }
export interface TaskRef { id: number; number: number; text: string }
export interface CycleItem extends TaskRef {
  doneDate: string;
  /** null — задача закрыта, минуя In progress, или момент входа в работу неизвестен */
  cycleDays: number | null;
  leadDays: number;
  /** таймлайн восстановлен частично (у старых задач нет журнала переходов) */
  estimated: boolean;
}
export interface AgingItem extends TaskRef { ageDays: number; estimated: boolean; overSle: boolean; blocked: boolean; assignees: string[] }
export interface BlockedItem extends TaskRef { status: Status; days: number | null }
export interface AnalyticsPerson { key: string; name: string; closed: number; stars: number; wip: number }
export interface AnalyticsView {
  days: AnalyticsDays;
  from: string;
  to: string;
  /** всего живых задач с учётом фильтра (удалённые не учитываются) */
  total: number;
  kpi: { closed: Kpi; stars: Kpi; cycleP50: Kpi; onTime: Kpi };
  cfd: { points: CfdPoint[]; avgWip: number; throughputPerWeek: number; littleDays: number | null; signals: FlowSignal[] };
  /** по дням для 7 дней, иначе по неделям с понедельника (края обрезаны периодом) */
  throughput: ThroughputBucket[];
  cycle: { cycle: TimeStats; lead: TimeStats; items: CycleItem[]; withoutProgress: number; estimated: number };
  wip: { now: number; queue: number; sle: number; sleFromData: boolean; aging: AgingItem[] };
  blocks: { now: BlockedItem[]; share: number | null; tasks: number; unknownStart: number };
  deadlines: { closed: number; onTime: number; overdueOpen: number };
  people: AnalyticsPerson[];
  /** исполнители открытых задач и закрытых за оба периода — варианты фильтра, от фильтра не зависят */
  assignees: { key: string; name: string }[];
}
