/**
 * Minimal typings for the parts of Aladin Lite v3 used by this app
 * (the package ships no TypeScript declarations).
 * API reference: https://cds-astro.github.io/aladin-lite/
 */
declare module 'aladin-lite' {
  export interface AladinOptions {
    /** Widget UI theme; when omitted Aladin follows the OS preference. */
    mode?: 'dark' | 'light';
    survey?: string;
    /** Field of view in degrees. */
    fov?: number;
    /** "ra dec" in decimal degrees, or an object name resolved by Sesame. */
    target?: string;
    cooFrame?: 'ICRS' | 'ICRSd' | 'equatorial' | 'galactic';
    projection?: string;
    backgroundColor?: string;
    log?: boolean;
    showReticle?: boolean;
    showZoomControl?: boolean;
    showFullscreenControl?: boolean;
    showLayersControl?: boolean;
    showFrame?: boolean;
    showFov?: boolean;
    showCooLocation?: boolean;
    showProjectionControl?: boolean;
    showSettingsControl?: boolean;
    showShareControl?: boolean;
    showSimbadPointerControl?: boolean;
    showCooGridControl?: boolean;
    showContextMenu?: boolean;
    showStatusBar?: boolean;
  }

  export interface AladinInstance {
    gotoRaDec(raDeg: number, decDeg: number): void;
    setFoV(fovDeg: number): void;
    getFov(): [number, number];
    increaseZoom(): void;
    decreaseZoom(): void;
    setImageSurvey(surveyIdOrUrl: string): void;
  }

  export interface AladinStatic {
    /** Resolves once the WebAssembly core is ready; rejects when WebGL2 is unavailable. */
    init: Promise<void>;
    aladin(container: HTMLElement | string, options?: AladinOptions): AladinInstance;
  }

  const A: AladinStatic;
  export default A;
}
