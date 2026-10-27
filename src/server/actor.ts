import { AsyncLocalStorage } from 'node:async_hooks';

const actorStorage = new AsyncLocalStorage<string>();

/** Account id bound to the current request, or null for trusted server paths. */
export function currentAccountId(): string | null {
  return actorStorage.getStore() ?? null;
}

export function runWithAccount<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  return actorStorage.run(accountId, fn);
}

export function actorAllowsTribute(ownerAccountId: string | null | undefined): boolean {
  const actor = currentAccountId();
  if (!actor) {
    return true;
  }
  return ownerAccountId === actor;
}
