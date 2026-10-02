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
  authorId: number;
  authorName: string;
  assignees: AssigneeView[];
  canEdit: boolean;
  canEditText: boolean;
  canDelete: boolean;
}

export interface BoardView {
  chat: { id: number; title: string; type: string };
  me: { userId: number; canCreate: boolean };
  members: AssigneeView[];
  cards: CardView[];
}

export interface CommentView { id: number; kind: 'comment' | 'system'; text: string; authorName: string | null; createdAt: string }
export interface TaskDetail { card: CardView; comments: CommentView[] }
export interface ChatSummary { id: number; title: string }
