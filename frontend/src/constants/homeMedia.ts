/**
 * Drop-in media for the Home page. A missing file keeps the reserved slot empty.
 * Trajectory: src/assets/home/spherex-trajectory.gif (png and webp also work).
 * Portrait:   src/assets/team/<member id>.jpg (png and webp also work).
 */
const trajectoryFiles = import.meta.glob<string>('../assets/home/spherex-trajectory.{gif,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const portraitFiles = import.meta.glob<string>('../assets/team/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const SPHEREX_TRAJECTORY_GIF: string | null = Object.values(trajectoryFiles)[0] ?? null;

/**
 * Streamed from NASA SVS (media group 379671). preload="none" keeps it off the page until play.
 * https://svs.gsfc.nasa.gov/14966/#media_group_379671
 */
export const SPHEREX_TRAJECTORY_VIDEO = {
  src: 'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014966/SPHEREx_SpacecraftAnimation_01_R27_TwoTurns_SpaceBackg_4K.mp4',
  poster:
    'https://svs.gsfc.nasa.gov/vis/a010000/a014900/a014966/SPHEREx_SurveyAnimationShot1_Stlll_searchweb.png',
} as const;

export function teamPortrait(memberId: string): string | null {
  const match = Object.entries(portraitFiles).find(([path]) => {
    const fileName = path.split('/').pop() ?? '';
    const baseName = fileName.slice(0, fileName.lastIndexOf('.'));
    return baseName === memberId;
  });
  return match ? match[1] : null;
}
