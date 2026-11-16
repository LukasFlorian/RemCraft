/**
 * Identifier generation.
 *
 * Ids are 16-character base62 strings drawn from a cryptographically secure
 * random source (~95 bits of entropy), which makes collisions between devices
 * that create records offline practically impossible.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Creates a new random identifier.
 *
 * @param length Number of characters (default 16).
 * @returns A random base62 string.
 */
export function newId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    // 248 = 62 * 4, rejection sampling is unnecessary for ids: the tiny bias
    // of the modulo is irrelevant for uniqueness.
    id += ALPHABET[byte % ALPHABET.length];
  }
  return id;
}
