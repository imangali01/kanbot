import { describe, expect, it } from 'vitest';
import { canChangeAuthor, canComment, canCreate, canDelete, canEdit, canEditText, canView, computeIsCreator, type Actor } from './permissions';

const actor = (p: Partial<Actor> = {}): Actor => ({ userId: 1, isSuperadmin: false, isMember: true, isCreator: false, ...p });
const task = { authorId: 100, assigneeIds: [1, 2] };
const other = { authorId: 100, assigneeIds: [3] };

describe('computeIsCreator', () => {
  it('mode all: every member', () => {
    expect(computeIsCreator('all', [], 1, true)).toBe(true);
    expect(computeIsCreator('all', [], 1, false)).toBe(false);
  });
  it('mode list: only allowlisted members', () => {
    expect(computeIsCreator('list', [1], 1, true)).toBe(true);
    expect(computeIsCreator('list', [2], 1, true)).toBe(false);
  });
});

describe('permissions', () => {
  it('members view and comment, non-members do not', () => {
    expect(canView(actor())).toBe(true);
    expect(canComment(actor())).toBe(true);
    expect(canView(actor({ isMember: false }))).toBe(false);
  });
  it('create requires creator', () => {
    expect(canCreate(actor({ isCreator: true }))).toBe(true);
    expect(canCreate(actor())).toBe(false);
  });
  it('creator edits any card', () => {
    expect(canEdit(actor({ isCreator: true }), other)).toBe(true);
  });
  it('assignee edits own card only', () => {
    expect(canEdit(actor(), task)).toBe(true);
    expect(canEdit(actor(), other)).toBe(false);
  });
  it('plain member cannot edit', () => {
    expect(canEdit(actor({ userId: 9 }), task)).toBe(false);
  });
  it('text: author or creator, not plain assignee', () => {
    expect(canEditText(actor(), task)).toBe(false);
    expect(canEditText(actor({ userId: 100 }), task)).toBe(true);
    expect(canEditText(actor({ isCreator: true }), task)).toBe(true);
  });
  it('delete: author or superadmin', () => {
    expect(canDelete(actor({ userId: 100 }), task)).toBe(true);
    expect(canDelete(actor({ isSuperadmin: true }), task)).toBe(true);
    expect(canDelete(actor({ isCreator: true }), task)).toBe(false);
  });
  it('non-member cannot edit even as assignee', () => {
    expect(canEdit(actor({ isMember: false }), task)).toBe(false);
  });
  it('change author: only those who can create tickets', () => {
    expect(canChangeAuthor(actor({ isCreator: true }))).toBe(true);
    expect(canChangeAuthor(actor({ userId: 100 }))).toBe(false);
    expect(canChangeAuthor(actor({ isCreator: true, isMember: false }))).toBe(true);
  });
});
