import { encodePng } from './png-codec';
import type { RgbaImage } from './pixels';

export const EXAMPLE_STYLE_KEYS = [
  'timeless',
  'warm_light',
  'cinematic_dark',
  'family_album',
  'simple_contemporary',
] as const;
export type ExampleStyleKey = (typeof EXAMPLE_STYLE_KEYS)[number];

export type ExampleStyleTokens = {
  key: ExampleStyleKey;
  background: [number, number, number];
  paper: [number, number, number];
  accent: [number, number, number];
  ink: [number, number, number];
  treatment: 'editorial' | 'fullBleed' | 'spotlight';
};

export const EXAMPLE_STYLE_TOKENS: Record<ExampleStyleKey, ExampleStyleTokens> = {
  timeless: {
    key: 'timeless',
    background: [246, 241, 232],
    paper: [255, 253, 248],
    accent: [169, 120, 76],
    ink: [28, 36, 48],
    treatment: 'editorial',
  },
  warm_light: {
    key: 'warm_light',
    background: [243, 227, 207],
    paper: [255, 246, 234],
    accent: [196, 106, 58],
    ink: [58, 36, 22],
    treatment: 'fullBleed',
  },
  cinematic_dark: {
    key: 'cinematic_dark',
    background: [18, 20, 24],
    paper: [26, 29, 34],
    accent: [212, 180, 131],
    ink: [244, 239, 230],
    treatment: 'spotlight',
  },
  family_album: {
    key: 'family_album',
    background: [239, 230, 214],
    paper: [247, 241, 230],
    accent: [139, 90, 60],
    ink: [44, 36, 28],
    treatment: 'editorial',
  },
  simple_contemporary: {
    key: 'simple_contemporary',
    background: [244, 242, 238],
    paper: [255, 255, 255],
    accent: [74, 85, 96],
    ink: [26, 26, 26],
    treatment: 'fullBleed',
  },
};

function fillRect(
  image: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
): void {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(image.width, Math.ceil(x1));
  const bottom = Math.min(image.height, Math.ceil(y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      image.data.set([color[0], color[1], color[2], 255], (y * image.width + x) * 4);
    }
  }
}

export function renderExampleStyleFrame(key: ExampleStyleKey, width = 320, height = 180): Uint8Array {
  const tokens = EXAMPLE_STYLE_TOKENS[key];
  const data = new Uint8Array(width * height * 4);
  const image: RgbaImage = { width, height, data };
  fillRect(image, 0, 0, width, height, tokens.background);
  if (tokens.treatment === 'editorial') {
    fillRect(image, width * 0.12, height * 0.14, width * 0.88, height * 0.86, tokens.paper);
    fillRect(image, width * 0.2, height * 0.22, width * 0.8, height * 0.72, tokens.ink);
    fillRect(image, width * 0.2, height * 0.78, width * 0.45, height * 0.82, tokens.accent);
  } else if (tokens.treatment === 'fullBleed') {
    fillRect(image, 0, 0, width, height, tokens.paper);
    fillRect(image, 0, height * 0.08, width, height * 0.78, tokens.ink);
    fillRect(image, 0, height * 0.78, width, height, tokens.accent);
  } else {
    fillRect(image, width * 0.08, height * 0.1, width * 0.92, height * 0.9, tokens.paper);
    fillRect(image, width * 0.28, height * 0.18, width * 0.72, height * 0.78, tokens.ink);
    fillRect(image, width * 0.28, height * 0.82, width * 0.52, height * 0.86, tokens.accent);
  }
  return encodePng(image);
}

export function exampleStyleFrameDataUrl(key: ExampleStyleKey): string {
  const bytes = renderExampleStyleFrame(key);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}
