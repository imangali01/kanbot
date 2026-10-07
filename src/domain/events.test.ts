import { describe, expect, it } from 'vitest';
import { formatEvent, mergeHistory, type TaskEvent } from './events';

const ev = (type: TaskEvent['type'], payload: TaskEvent['payload'], over: Partial<TaskEvent> = {}): TaskEvent =>
  ({ id: 1, type, payload, actorName: 'Иван', createdAt: '2026-10-07T05:00:00.000Z', ...over }) as TaskEvent;

describe('formatEvent', () => {
  it('created', () => {
    expect(formatEvent(ev('created', { author: 'Иван', assignees: ['Мария', 'Пётр'] }))).toBe('создал задачу, исполнители: Мария, Пётр');
    expect(formatEvent(ev('created', { author: 'Иван', assignees: [] }))).toBe('создал задачу');
  });
  it('status', () => {
    expect(formatEvent(ev('status', { from: 'todo', to: 'in_progress' }))).toBe('перенёс: Todo → In progress');
  });
  it('author', () => {
    expect(formatEvent(ev('author', { from: 'Иван', to: 'Мария' }))).toBe('сменил постановщика: Иван → Мария');
  });
  it('assignees', () => {
    expect(formatEvent(ev('assignees', { from: [], to: ['Мария'] }))).toBe('сменил исполнителей: никого → Мария');
    expect(formatEvent(ev('assignees', { from: ['А', 'Б'], to: [] }))).toBe('сменил исполнителей: А, Б → никого');
  });
  it('stars, deadline', () => {
    expect(formatEvent(ev('stars', { from: 1, to: 3 }))).toBe('изменил сложность: 1 → 3');
    expect(formatEvent(ev('deadline', { from: '2026-10-08', to: '2026-10-10' }))).toBe('изменил срок: 08.10.2026 → 10.10.2026');
  });
  it('text', () => {
    expect(formatEvent(ev('text', { from: 'a', to: 'b' }))).toBe('изменил текст задачи');
  });
  it('blocked / unblocked', () => {
    expect(formatEvent(ev('blocked', { reason: 'ждём ТЗ' }))).toBe('заблокировал: ждём ТЗ');
    expect(formatEvent(ev('unblocked', { reason: 'ждём ТЗ' }))).toBe('снял блокировку (была: ждём ТЗ)');
    expect(formatEvent(ev('unblocked', { reason: null }))).toBe('снял блокировку');
  });
});

describe('mergeHistory', () => {
  it('sorts events and comments by time', () => {
    const items = mergeHistory(
      [ev('stars', { from: 1, to: 2 }, { id: 2, createdAt: '2026-10-07T06:00:00.000Z' }), ev('created', { author: 'Иван', assignees: [] }, { id: 1, createdAt: '2026-10-07T05:00:00.000Z' })],
      [{ id: 5, kind: 'comment', text: 'привет', authorName: 'Мария', createdAt: '2026-10-07T05:30:00.000Z' }],
    );
    expect(items.map((i) => i.id)).toEqual(['e:1', 'c:5', 'e:2']);
    expect(items[1]).toMatchObject({ kind: 'comment', actorName: 'Мария', text: 'привет' });
    expect(items[0]).toMatchObject({ kind: 'event', actorName: 'Иван', text: 'создал задачу' });
  });
  it('system comments keep their text without actor', () => {
    const items = mergeHistory([], [{ id: 1, kind: 'system', text: 'Разблокировано', authorName: null, createdAt: '2026-10-07T05:30:00.000Z' }]);
    expect(items[0]).toMatchObject({ kind: 'event', actorName: null, text: 'Разблокировано' });
  });
});
