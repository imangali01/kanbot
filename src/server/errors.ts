export class AccessError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 413 | 502, message: string) {
    super(message);
  }
}
