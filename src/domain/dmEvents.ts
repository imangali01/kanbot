/** Типы личных уведомлений бота. Админ включает и выключает их отдельно для каждой группы. */
export const DM_EVENTS = [
  { key: 'created', title: 'Новая задача', hint: 'Исполнителю, когда ему поставили задачу' },
  { key: 'moved', title: 'Перенос по колонкам', hint: 'Автору и исполнителям, когда задачу перенесли между Todo и In progress' },
  { key: 'done', title: 'Задача выполнена', hint: 'Автору и исполнителям, когда задачу перенесли в Done' },
  { key: 'blocked', title: 'Блокировки', hint: 'Автору и исполнителям, когда задачу заблокировали или сняли блок' },
  { key: 'digest', title: 'Ежедневная сводка', hint: 'Задачи этой группы на сегодня и просроченные' },
] as const;

export type DmEvent = (typeof DM_EVENTS)[number]['key'];
export const DM_EVENT_KEYS = DM_EVENTS.map((e) => e.key) as [DmEvent, ...DmEvent[]];

/** В базе хранится список выключенных типов: новый тип по умолчанию включён везде. */
export function dmEnabled(off: readonly string[], event: DmEvent): boolean {
  return !off.includes(event);
}
