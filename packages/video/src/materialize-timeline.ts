import { parseTimelineContract, type TimelineContract } from '@memorialvideo/contracts';
import { storageBucketForSrc, storageVariantKey } from '@memorialvideo/domain';
import { createHash } from 'node:crypto';

export function queuedPublicPath(assetId: string, kind: 'image' | 'video'): string {
  return `queue/${assetId}.${kind === 'video' ? 'mp4' : 'jpg'}`;
}

export function queuedAudioPublicPath(src: string, assetId?: string): string {
  const digest = createHash('sha256').update(src).digest('hex').slice(0, 16);
  const id = assetId ?? digest;
  const lower = src.toLowerCase();
  const ext = lower.endsWith('.mp3') ? 'mp3' : lower.endsWith('.m4a') ? 'm4a' : 'wav';
  return `queue/audio-${id}.${ext}`;
}

export async function materializeQueuedTimeline(
  timeline: TimelineContract,
  download: (key: string, bucket?: 'project-variants' | 'project-originals') => Promise<Uint8Array | null>,
  publish: (bytes: Uint8Array, relativePath: string) => Promise<void>,
): Promise<TimelineContract> {
  const scenes = [];
  for (const scene of timeline.scenes) {
    if (scene.type !== 'image' && scene.type !== 'video') {
      scenes.push(scene);
      continue;
    }
    const key = storageVariantKey(scene.asset.src);
    if (!key) {
      scenes.push(scene);
      continue;
    }
    const bucket = storageBucketForSrc(scene.asset.src) ?? 'project-variants';
    const bytes = await download(key, bucket);
    if (!bytes) {
      throw new Error('variant_missing');
    }
    const relative = queuedPublicPath(scene.asset.assetId, scene.type);
    await publish(bytes, relative);
    scenes.push({
      ...scene,
      asset: { ...scene.asset, src: relative },
    });
  }

  let audio = timeline.audio;
  if (audio) {
    const tracks = [];
    for (const track of audio.tracks) {
      const clips = [];
      for (const clip of track.clips) {
        if (clip.sourceSceneId) {
          clips.push(clip);
          continue;
        }
        const key = storageVariantKey(clip.src);
        if (!key) {
          clips.push(clip);
          continue;
        }
        const bucket = storageBucketForSrc(clip.src) ?? 'project-variants';
        const bytes = await download(key, bucket);
        if (!bytes) {
          throw new Error('audio_variant_missing');
        }
        const relative = queuedAudioPublicPath(clip.src, clip.assetId);
        await publish(bytes, relative);
        clips.push({ ...clip, src: relative });
      }
      tracks.push({ ...track, clips });
    }
    audio = { ...audio, tracks };
  }

  return parseTimelineContract({ ...timeline, scenes, audio });
}
