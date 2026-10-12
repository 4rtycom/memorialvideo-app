/**
 * Prompt 17 — RenderProvider abstraction.
 * Local worker is the development/default provider. Remotion Lambda (or similar)
 * stays selectable by env but is not provisioned without explicit authorization.
 */
export const RENDER_PROVIDERS = ['local', 'remotion_lambda'] as const;
export type RenderProviderId = (typeof RENDER_PROVIDERS)[number];

export type RenderProviderCapabilities = {
  id: RenderProviderId;
  supportsLongFilms: boolean;
  runsInsideVercelRequest: boolean;
  regionConfigurable: boolean;
};

export const RENDER_PROVIDER_CAPABILITIES: Record<RenderProviderId, RenderProviderCapabilities> = {
  local: {
    id: 'local',
    supportsLongFilms: true,
    runsInsideVercelRequest: false,
    regionConfigurable: false,
  },
  remotion_lambda: {
    id: 'remotion_lambda',
    supportsLongFilms: true,
    runsInsideVercelRequest: false,
    regionConfigurable: true,
  },
};

export function resolveRenderProvider(value: string | null | undefined): RenderProviderId {
  if (value === 'remotion_lambda') {
    return 'remotion_lambda';
  }
  return 'local';
}

export function renderProviderCapabilities(id: RenderProviderId): RenderProviderCapabilities {
  return RENDER_PROVIDER_CAPABILITIES[id];
}
