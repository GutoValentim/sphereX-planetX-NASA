import type { TeamMember } from '../types/home';

/** Alphabetical by name, ignoring case and accents. The original array is left unchanged. */
export function sortTeamMembers(members: readonly TeamMember[]): TeamMember[] {
  return [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function memberInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('');
}
