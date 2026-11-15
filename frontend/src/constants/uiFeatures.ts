/**
 * Independent UI features, so each one can be tuned or switched off on its own.
 * Each flag names the component (or CSS class) that implements it.
 */
export const UI_FEATURES = {
  /** Sky map: slight blur on the all-sky background image (SkySphere.module.css → .canvasSoft). */
  skyBackgroundBlur: true,
  /** Sky map: darker all-sky image so mapped targets stand out (SkySphere.module.css → .canvasDim). */
  skyDarkBackground: true,
  /** Sky map: galactic grid drawn as dotted lines (skySphereRenderer → uDotted). */
  skyGridDotted: true,
  /** Sky map: tiny floating dust particles drifting slowly (SkyDust). */
  skyDust: true,
  /** Sky map: dust particles lag and drift when the view moves, like inertia (SkyDust). */
  skyDustInertia: true,
  /** Sky map: glowing animated dots on the mapped targets, with a hover card (SkyTargetMarkers). */
  skyTargetMarkers: true,
  /** Sky map: target name above each mapped-target dot (SkyTargetMarkers → .label). */
  skyTargetLabels: true,
  /** Sky map: "Mapped targets" list that flies the camera to a target and opens its card (SkyTargetList). */
  skyTargetList: true,
  /** Image page: "Mapped targets" tab in the side panel (MappedTargetsPanel). */
  viewerTargetsTab: true,
  /** Search coordinates page: "Mapped targets" tab whose entries fill in the form (KnownTargets). */
  exploreTargetsList: true,
  /** Search / sky map / image pages: switch between "Search coordinates" and "Sky map" (ExploreModeSwitch). */
  exploreModeSwitch: true,
  /** Image page: spectrum as rendered charts, combined + one per band, like the lab (SpectrumGallery). */
  spectrumGallery: true,
} as const;
