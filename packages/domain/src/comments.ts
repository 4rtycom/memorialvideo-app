export function canResolveComment(input: { ownerUserId: string; actorUserId: string; resolvedAt: string | null }): boolean {
  return input.ownerUserId === input.actorUserId && !input.resolvedAt;
}
