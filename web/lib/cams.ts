'use client';

/**
 * Per-stage IP-camera configuration shared by the pipeline page, the camera
 * settings modal and the capture studio. Stored per browser in localStorage so
 * an operator wires their cameras once and every stage capture reuses them.
 */

export type CamSource = 'local' | 'ipcam';

export interface CamConfig {
  url: string;
  enabled: boolean;
}

export interface CamSettings {
  source: CamSource;
  cams: Record<string, CamConfig>;
}

/** The five pipeline stages, each gets its own camera section in settings. */
export const CAM_STAGES = ['receiving', 'prep', 'pack', 'returns', 'recovery'] as const;
export type CamStage = (typeof CAM_STAGES)[number];

const STORAGE_KEY = 'pod.cams';

export function defaultCamSettings(): CamSettings {
  const cams: Record<string, CamConfig> = {};
  for (const stage of CAM_STAGES) {
    cams[stage] = { url: '', enabled: false };
  }
  return { source: 'local', cams };
}

export function loadCamSettings(): CamSettings {
  const base = defaultCamSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<CamSettings>;
    const merged = defaultCamSettings();
    merged.source = parsed.source === 'ipcam' ? 'ipcam' : 'local';
    for (const stage of CAM_STAGES) {
      const c = parsed.cams?.[stage];
      if (c) merged.cams[stage] = { url: String(c.url || ''), enabled: Boolean(c.enabled) };
    }
    return merged;
  } catch {
    return base;
  }
}

export function saveCamSettings(settings: CamSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode) — settings just don't persist */
  }
}
