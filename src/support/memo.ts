/**
 * A small store of answers that were expensive to work out.
 *
 * A curvature field is worth keeping — one costs a smoothing pass and a sort over every vertex —
 * but not worth keeping without limit: it is a number per vertex, so a jaw's worth is a megabyte
 * apiece, and a dragged slider asks for a great many of them. What is kept is the few most
 * recently asked for; the rest are forgotten.
 *
 * Values are never `undefined`, which is how a miss is told from a hit.
 */
export interface Memo<K, V> {
  /** What is kept for `key`, counting as a use: what is being used is what is worth keeping. */
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  readonly size: number;
}

export function createMemo<K, V>(limit: number): Memo<K, V> {
  const kept = new Map<K, V>();

  return {
    get(key) {
      const value = kept.get(key);
      if (value === undefined) return undefined;

      // Putting it back moves it to the end of the queue, which is what makes this least recently
      // used rather than first in, first out.
      kept.delete(key);
      kept.set(key, value);
      return value;
    },

    set(key, value) {
      kept.delete(key);
      kept.set(key, value);
      if (kept.size <= limit) return;

      const oldest = kept.keys().next();
      if (!oldest.done) kept.delete(oldest.value);
    },

    get size() {
      return kept.size;
    },
  };
}
