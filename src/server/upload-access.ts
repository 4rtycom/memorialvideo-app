import { cookies } from 'next/headers';
import { resolveGuestContext } from '@/server/invites';
import { loadActiveTribute } from '@/server/session';
import { guestSessionCookieName } from '@/server/store';

/** Owner session or a redeemed guest invite may touch this tribute's private uploads. */
export async function callerCanAccessTribute(tributePublicId: string): Promise<boolean> {
  const active = await loadActiveTribute();
  if (active?.publicId === tributePublicId) {
    return true;
  }
  const jar = await cookies();
  const guestSessionId = jar.get(guestSessionCookieName())?.value;
  if (!guestSessionId) {
    return false;
  }
  const guest = await resolveGuestContext(guestSessionId);
  return guest.ok && guest.tribute.publicId === tributePublicId;
}
