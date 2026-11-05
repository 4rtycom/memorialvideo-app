export type CeremonyPackManifest = {
  schemaVersion: 1;
  videoFileName: string;
  checklistFileName: string;
  cueSheetFileName: string;
  width: 1920;
  height: 1080;
  notes: readonly string[];
};

export type CeremonyCueSheetChapter = {
  /** Human chapter title only — never raw captions or private media content. */
  title: string;
  /** Clock label when known (e.g. 01:42). */
  startLabel?: string | null;
};

export type CeremonyCueSheetInput = {
  publicId: string;
  /** Opaque tribute display name for venue handoff — never log elsewhere. */
  displayName?: string | null;
  chapters?: readonly CeremonyCueSheetChapter[];
  totalLabel?: string | null;
  /**
   * Honest: whether this ZIP includes the offline interactive operator player
   * (ceremony-player.html) for pause/resume during live speech.
   */
  interactivePlayerReady?: boolean;
  /** Relative path to the offline operator HTML when packed. */
  interactivePlayerFileName?: string | null;
};

export function safeCeremonyFileStem(publicId: string): string {
  const stem = publicId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return stem.length > 0 ? stem : 'memorial';
}

export const CEREMONY_OFFLINE_PLAYER_FILE = 'ceremony-player.html' as const;

export function buildCeremonyPackManifest(publicId: string): CeremonyPackManifest {
  const stem = safeCeremonyFileStem(publicId);
  return {
    schemaVersion: 1,
    videoFileName: `${stem}-1080p.mp4`,
    checklistFileName: `${stem}-playback.txt`,
    cueSheetFileName: `${stem}-cue-sheet.txt`,
    width: 1920,
    height: 1080,
    notes: [
      'Prefer ceremony-player.html for live speeches (Pause for speech / Resume). Keep the MP4 as backup.',
      'Open the player from this folder on the ceremony computer before guests arrive — no internet required.',
      'Keep this folder as a second copy on another drive.',
      'Use the cue sheet for the running order and marked speech holds.',
    ],
  };
}

export function ceremonyChecklistText(publicId: string): string {
  const pack = buildCeremonyPackManifest(publicId);
  return [
    'Venue playback checklist',
    '========================',
    '',
    ...pack.notes,
    '',
    'Before the service',
    '- Download this pack to the venue computer (or a trusted USB drive).',
    '- Test sound on the venue speakers at ceremony volume.',
    '- Confirm widescreen 16:9 framing on the projector or TV.',
    '- Confirm music rights for this tribute are cleared for the venue.',
    '',
    'During the service',
    '- One person operates playback. Open ceremony-player.html, then use Pause for speech / Resume.',
    '- The MP4 alone cannot wait for unscheduled words — use the interactive player for live holds.',
    '',
  ].join('\n');
}

/**
 * Printed running order for the venue operator.
 * Static MP4 cannot wait for unscheduled speeches — pause/resume stays human-operated.
 */
export function ceremonyCueSheetText(input: CeremonyCueSheetInput): string {
  const pack = buildCeremonyPackManifest(input.publicId);
  const chapters =
    input.chapters && input.chapters.length > 0
      ? input.chapters
      : [{ title: 'Full film (no chapter markers published yet)' }];
  const lines: string[] = [
    'Ceremony cue sheet — running order',
    '==================================',
    '',
    input.displayName ? `Tribute: ${input.displayName}` : 'Tribute: (name on film titles)',
    input.totalLabel ? `Film length: ${input.totalLabel}` : 'Film length: see verified MP4',
    `Video file: ${pack.videoFileName}`,
    `Picture: ${pack.width}×${pack.height} (16:9)`,
    '',
    'Operator notes',
    '- Pause for live speeches or silences; resume only when the room is ready.',
    '- Skip ahead only if the family agreed beforehand.',
    input.interactivePlayerReady
      ? `- Offline interactive player: open ${input.interactivePlayerFileName ?? CEREMONY_OFFLINE_PLAYER_FILE} (same folder as the MP4).`
      : '- Interactive speech-pause player is not included in this ZIP — use Pause/Resume on the venue player.',
    '- In-app Ceremony Player (Ready for the service → Ceremony Player) also auto-holds at marked speech pauses.',
    '',
    'Running order',
  ];
  chapters.forEach((chapter, index) => {
    const n = String(index + 1).padStart(2, '0');
    const clock = chapter.startLabel ? `  ·  ${chapter.startLabel}` : '';
    lines.push(`${n}  ${chapter.title}${clock}`);
  });
  lines.push('', 'End of cue sheet', '');
  return lines.join('\n');
}

/**
 * Self-contained offline operator HTML for the venue pack.
 * Plays the sibling MP4; Pause for speech freezes on the current still until Resume.
 * No network, no analytics, no tokens.
 */
export function ceremonyOfflinePlayerHtml(input: {
  videoFileName: string;
  displayName?: string | null;
  cues?: readonly { title: string; startLabel?: string | null; startSeconds?: number | null }[];
}): string {
  const title = input.displayName?.trim() || 'Memorial film';
  const cuesJson = JSON.stringify(
    (input.cues ?? []).map((cue) => ({
      title: cue.title,
      startLabel: cue.startLabel ?? '',
      startSeconds: typeof cue.startSeconds === 'number' ? cue.startSeconds : null,
    })),
  );
  // Intentionally inline — venue machines may open this file:// without a bundler.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ceremony Player — ${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; --bg:#101b21; --panel:#1a2a31; --soft:#e5ede4; --accent:#c4a574; --muted:#9bb0a8; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--soft); font-family: Georgia, "Times New Roman", serif; }
  body { display:grid; grid-template-rows: 1fr auto; }
  .stage { position:relative; background:#000; display:grid; place-items:center; min-height:0; }
  video { width:100%; height:100%; max-height:100%; object-fit:contain; background:#000; }
  .hold {
    display:none; position:absolute; inset:0; align-items:center; justify-content:center;
    background:rgba(16,27,33,0.72); text-align:center; padding:2rem;
  }
  .hold.active { display:flex; flex-direction:column; gap:0.75rem; }
  .hold h1 { margin:0; font-weight:400; font-size:clamp(1.5rem,4vw,2.75rem); }
  .hold p { margin:0; color:var(--muted); font-family: system-ui, sans-serif; font-size:0.95rem; }
  .ops {
    background:var(--panel); padding:1rem 1.25rem 1.25rem; display:grid; gap:0.85rem;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .ops h2 { margin:0; font-size:0.75rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--accent); font-weight:700; }
  .row { display:flex; flex-wrap:wrap; gap:0.6rem; align-items:center; }
  button {
    appearance:none; border:0; border-radius:999px; padding:0.65rem 1.1rem; font:inherit; font-size:0.95rem;
    cursor:pointer; background:#365159; color:white;
  }
  button.primary { background:var(--accent); color:#101b21; font-weight:600; }
  button:disabled { opacity:0.45; cursor:not-allowed; }
  .clock { color:var(--muted); font-size:0.85rem; margin-left:auto; }
  .cues { list-style:none; margin:0; padding:0; display:grid; gap:0.35rem; max-height:8rem; overflow:auto; }
  .cues li { display:flex; gap:0.75rem; align-items:center; font-size:0.85rem; }
  .cues button { padding:0.35rem 0.75rem; font-size:0.8rem; border-radius:8px; }
  .hint { margin:0; color:var(--muted); font-size:0.8rem; }
</style>
</head>
<body>
  <div class="stage" id="stage">
    <video id="film" playsinline preload="metadata" src="./${escapeAttr(input.videoFileName)}"></video>
    <div class="hold" id="hold" role="status" aria-live="polite">
      <h1 id="holdTitle">Waiting for live words</h1>
      <p id="holdNote">Press Resume film when the room is ready.</p>
    </div>
  </div>
  <div class="ops" data-testid="offline-ceremony-ops">
    <h2>Operator controls</h2>
    <div class="row">
      <button type="button" class="primary" id="btnPause">Pause for speech</button>
      <button type="button" id="btnResume">Resume film</button>
      <button type="button" id="btnBack">Back 10s</button>
      <button type="button" id="btnSkip">Skip 10s</button>
      <button type="button" id="btnRestart">Restart</button>
      <button type="button" id="btnFull">Fullscreen display</button>
      <span class="clock" id="clock">0:00 / 0:00</span>
    </div>
    <p class="hint">One operator. Guests see the display above. No internet required.</p>
    <ul class="cues" id="cues"></ul>
  </div>
<script>
(function () {
  var video = document.getElementById('film');
  var hold = document.getElementById('hold');
  var holdTitle = document.getElementById('holdTitle');
  var holdNote = document.getElementById('holdNote');
  var clock = document.getElementById('clock');
  var cues = ${cuesJson};
  var speechHold = false;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }
  function setHold(on, title, note) {
    speechHold = on;
    hold.classList.toggle('active', on);
    if (title) holdTitle.textContent = title;
    if (note) holdNote.textContent = note;
  }
  function tick() {
    clock.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
  }
  document.getElementById('btnPause').onclick = function () {
    video.pause();
    setHold(true, 'Waiting for live words', 'Press Resume film when the room is ready.');
  };
  document.getElementById('btnResume').onclick = function () {
    setHold(false);
    video.play().catch(function () {});
  };
  document.getElementById('btnBack').onclick = function () {
    video.currentTime = Math.max(0, video.currentTime - 10);
  };
  document.getElementById('btnSkip').onclick = function () {
    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
  };
  document.getElementById('btnRestart').onclick = function () {
    video.pause();
    video.currentTime = 0;
    setHold(false);
  };
  document.getElementById('btnFull').onclick = function () {
    var stage = document.getElementById('stage');
    if (!document.fullscreenElement) stage.requestFullscreen().catch(function () {});
    else document.exitFullscreen().catch(function () {});
  };
  video.addEventListener('timeupdate', tick);
  video.addEventListener('loadedmetadata', tick);
  var list = document.getElementById('cues');
  cues.forEach(function (cue) {
    var li = document.createElement('li');
    var label = document.createElement('span');
    label.textContent = (cue.startLabel ? cue.startLabel + ' · ' : '') + cue.title;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Cue here';
    btn.onclick = function () {
      if (typeof cue.startSeconds === 'number') video.currentTime = cue.startSeconds;
      video.pause();
      setHold(true, cue.title, 'Cued. Resume when ready.');
    };
    li.appendChild(label);
    li.appendChild(btn);
    list.appendChild(li);
  });
})();
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

/**
 * Classic entitlement + QC gate for Ceremony Pack ZIP.
 * MV-111 adds Ceremony Readiness on top via canProceedWithCeremonyPack —
 * Output QC readiness alone is not a Ceremony Readiness report.
 */
export function canBuildCeremonyPack(input: {
  includesCeremonyPack: boolean;
  outputVerified: boolean;
  qcPassed: boolean;
}): boolean {
  return input.includesCeremonyPack && input.outputVerified && input.qcPassed;
}
