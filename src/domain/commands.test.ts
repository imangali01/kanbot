import { describe, expect, it } from 'vitest';
import { commandName } from './commands';

const BOT = 'skai_broadcast_bot';

describe('commandName', () => {
  it('plain command', () => expect(commandName('/help', BOT)).toBe('help'));
  it('command addressed to our bot, case-insensitive', () => {
    expect(commandName('/help@skai_broadcast_bot', BOT)).toBe('help');
    expect(commandName('/HELP@SKAI_BROADCAST_BOT', BOT)).toBe('help');
  });
  it('command addressed to another bot is ignored', () => expect(commandName('/help@other_bot', BOT)).toBeNull());
  it('command must be at the start', () => expect(commandName('привет /help', BOT)).toBeNull());
  it('arguments after the command are allowed', () => expect(commandName('/task @a1 текст', BOT)).toBe('task'));
  it('text that only starts with the same letters is not a command', () => expect(commandName('/helpme', BOT)).toBe('helpme'));
  it('empty or missing text', () => {
    expect(commandName('', BOT)).toBeNull();
    expect(commandName(undefined, BOT)).toBeNull();
  });
});
