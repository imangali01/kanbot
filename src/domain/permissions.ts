export interface Actor { userId: number; isSuperadmin: boolean; isMember: boolean; isCreator: boolean }
export interface TaskAccessRef { authorId: number; assigneeIds: number[] }

export function computeIsCreator(mode: string, allowlist: number[], userId: number, isMember: boolean): boolean {
  return isMember && (mode === 'all' || allowlist.includes(userId));
}

export function canView(a: Actor): boolean {
  return a.isMember;
}

export function canComment(a: Actor): boolean {
  return canView(a);
}

export function canCreate(a: Actor): boolean {
  return a.isCreator;
}

export function canEdit(a: Actor, t: TaskAccessRef): boolean {
  return a.isMember && (a.isCreator || t.assigneeIds.includes(a.userId));
}

export function canEditText(a: Actor, t: TaskAccessRef): boolean {
  return a.isMember && (a.isCreator || t.authorId === a.userId);
}

export function canDelete(a: Actor, t: TaskAccessRef): boolean {
  return a.isSuperadmin || (a.isMember && t.authorId === a.userId);
}
