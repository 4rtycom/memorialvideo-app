export function planTimelinePublish(input: {
  currentVersion: number;
  expectedVersion?: number;
}): { action: 'publish'; nextVersion: number } | { action: 'conflict' } {
  if (input.expectedVersion !== undefined && input.expectedVersion !== input.currentVersion) {
    return { action: 'conflict' };
  }
  return { action: 'publish', nextVersion: input.currentVersion + 1 };
}
