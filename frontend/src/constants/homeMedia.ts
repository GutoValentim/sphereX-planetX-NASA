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

export function teamPortrait(memberId: string): string | null {
  const match = Object.entries(portraitFiles).find(([path]) => {
    const fileName = path.split('/').pop() ?? '';
    const baseName = fileName.slice(0, fileName.lastIndexOf('.'));
    return baseName === memberId;
  });
  return match ? match[1] : null;
}
