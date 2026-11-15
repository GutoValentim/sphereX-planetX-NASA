import type { AladinOptions, AladinStatic } from 'aladin-lite';

/**
 * Real sky survey shown until SPHEREx imagery is provided by the backend. It is not SPHEREx data.
 * Given as an explicit HiPS URL (NASA/IPAC IRSA mirror of CDS/P/DSS2/color) because resolving the
 * CDS ID depends on MocServer mirrors that may be unreachable, which leaves the map blank.
 */
export const REFERENCE_SURVEY = {
  url: 'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color',
  label: 'DSS2 color',
} as const;

export const DEFAULT_FOV_DEG = 1.5;

/** Keeps Aladin's native pan/scroll navigation; app-level controls (zoom, layers) live outside the widget. */
export const VIEWER_OPTIONS: AladinOptions = {
  // The viewer surface is dark in both app themes; Aladin's widget styles must match it, not the OS.
  mode: 'dark',
  survey: REFERENCE_SURVEY.url,
  fov: DEFAULT_FOV_DEG,
  cooFrame: 'ICRS',
  log: false,
  showReticle: true,
  showFov: true,
  showCooLocation: true,
  showZoomControl: false,
  showFullscreenControl: false,
  showLayersControl: false,
  showFrame: false,
  showProjectionControl: false,
  showSettingsControl: false,
  showShareControl: false,
  showSimbadPointerControl: false,
  showCooGridControl: false,
  showContextMenu: false,
  showStatusBar: false,
};

let aladinPromise: Promise<AladinStatic> | null = null;

/** Loads Aladin Lite (≈2.6 MB, includes its WebAssembly core) only when a viewer is first needed. */
export function loadAladin(): Promise<AladinStatic> {
  if (!aladinPromise) {
    aladinPromise = import('aladin-lite')
      .then(async ({ default: A }) => {
        await A.init;
        return A;
      })
      .catch((error: unknown) => {
        aladinPromise = null;
        throw error;
      });
  }
  return aladinPromise;
}
