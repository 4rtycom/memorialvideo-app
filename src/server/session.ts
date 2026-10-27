import { cookies } from 'next/headers';
import { isProjectPublicId } from '@memorialvideo/domain';
import { readAccountSession, withRequestOwner } from './account-session';
import { creatorEnv } from './env';
import { activeTributeCookieName, getTribute, type Tribute } from './store';

export async function readActiveTributeId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(activeTributeCookieName())?.value;
  if (!value || !isProjectPublicId(value)) {
    return null;
  }
  return value;
}

export async function setActiveTributeId(publicId: string): Promise<void> {
  if (!isProjectPublicId(publicId)) {
    throw new Error('invalid_public_id');
  }
  const jar = await cookies();
  jar.set(activeTributeCookieName(), publicId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearActiveTributeId(): Promise<void> {
  const jar = await cookies();
  jar.delete(activeTributeCookieName());
}

export async function loadActiveTribute(): Promise<Tribute | null> {
  const id = await readActiveTributeId();
  if (!id) {
    return null;
  }
  const accountId = await readAccountSession();
  if (!accountId && creatorEnv().APP_ENV !== 'local') {
    return null;
  }
  return withRequestOwner(() => getTribute(id));
}
