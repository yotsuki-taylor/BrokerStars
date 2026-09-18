/**
 * The name this player chose, as this browser last heard it.
 *
 * Every name the game draws comes from the host: Telegram's first name,
 * Google's display name, or the GUEST 4F2A the server minted. None of those
 * knows about a name typed into this game, so the chosen one arrives on the
 * profile (`nick`) and is kept here for the frame before the next profile does
 * — the same bargain the coins, the room and the wardrobe already make with
 * `localStorage`.
 *
 * It is a convenience and never the truth. What a leaderboard row says is
 * whatever `players.name` says, which is the server's; this only decides what
 * THIS player is called on their own screen between one answer and the next.
 */

import { read, write } from './store';

const KEY = 'brokerstars.nick';

export function loadNick(): string | null {
  const raw = read(KEY);
  return raw ? raw : null;
}

/**
 * Null clears it, which is what a profile with no chosen name means: somebody
 * who signed into a different account should not keep the last one's name on
 * their own screen.
 */
export function saveNick(nick: string | null): void {
  write(KEY, nick ?? '');
}
