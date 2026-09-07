/** A value the author may hand over live: the value itself, or a function that yields it, be it a signal, a computed or a closure. */
export type Live<T> = T | (() => T);

/** The current value of a live value. */
export function read<T>(value: Live<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}
