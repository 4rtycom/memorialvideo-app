/**
 * Which ceremony operator button is the "next obvious action".
 * Playing → Pause is primary. Paused or holding for live words → Resume is primary.
 */
export function ceremonyButtonEmphasis(input: { playing: boolean; holdActive: boolean }): {
  pause: 'primary' | 'secondary';
  resume: 'primary' | 'secondary';
} {
  const resumeNext = input.holdActive || !input.playing;
  return {
    pause: resumeNext ? 'secondary' : 'primary',
    resume: resumeNext ? 'primary' : 'secondary',
  };
}
