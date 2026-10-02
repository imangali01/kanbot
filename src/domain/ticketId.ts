export function ticketId(number: number): string {
  return `SD-${String(number).padStart(4, '0')}`;
}
