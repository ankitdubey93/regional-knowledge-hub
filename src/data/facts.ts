import type { Fact } from './schemas';

export { formatFact, factStatus, type FactStatus } from './factFormat';

export class UnknownFactError extends Error {}

export class FactsNotLoadedError extends Error {}

let registry: Record<string, Fact> | null = null;

/** Replaces the facts registry (the app loads it from the API; tests seed it). */
export function setFacts(next: Record<string, Fact>): void {
  registry = next;
}

export function factsLoaded(): boolean {
  return registry !== null;
}

export function allFacts(): Record<string, Fact> {
  if (registry === null) throw new FactsNotLoadedError('Facts are not loaded yet');
  return registry;
}

export function fact(key: string): Fact {
  const f = allFacts()[key];
  if (!f) throw new UnknownFactError(`Unknown fact "${key}"`);
  return f;
}

/** A rate fact in basis points. Throws if the fact is not a rate, so a calculator can never read the wrong kind. */
export function rateBp(key: string): number {
  const f = fact(key);
  if (f.unit !== 'bp' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not a rate`);
  return f.value;
}

export function cents(key: string): number {
  const f = fact(key);
  if (f.unit !== 'cents' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not an amount`);
  return f.value;
}

export function count(key: string): number {
  const f = fact(key);
  if (f.unit !== 'count' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not a count`);
  return f.value;
}
