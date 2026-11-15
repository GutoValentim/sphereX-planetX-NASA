import type { ExplorerFeature, HomeSectionCopy, TeamMember } from '../types/home';

/** Provisional copy. The final texts will be provided by the team. */
export const SPHEREX_SECTION: HomeSectionCopy = {
  id: 'spherex',
  title: 'What is SPHEREx?',
  paragraphs: [
    'SPHEREx is a NASA mission that observes the entire sky.',
    'This section will present the mission’s history, its goals and the technology on board.',
  ],
};

export const EXPLORER_SECTION: HomeSectionCopy = {
  id: 'sky-explorer',
  title: 'CosmoSPHERE - SPHEREx Cosmos Explorer',
  paragraphs: [
    'CosmoSPHERE is system built for the NASA Space Apps Challenge. Choose a coordinate or a position in the cosmos map, and the corresponding SPHEREx observation will be displayed. With this system, you can monitor moving objects, spectral bands and much more!',
  ],
};

export const EXPLORER_FEATURES: readonly ExplorerFeature[] = [
  {
    id: 'image',
    title: 'Sky image',
    description:
      'The image view centers the sky on your coordinates. Drag to move around and zoom in on the field.',
    example: 'image',
  },
  {
    id: 'chart',
    title: 'Chart',
    description:
      'The chart view plots the measurements for that observation, once the backend provides the series.',
    example: 'chart',
  },
];

export const TEAM_SECTION: HomeSectionCopy = {
  id: 'team',
  title: 'Who we are',
  paragraphs: ['The people building Sky Explorer. Names are listed in alphabetical order.'],
};

/**
 * Add one entry per person. Order in this array does not matter: the page sorts by name.
 * A portrait appears on the right when src/assets/team/<id>.jpg (or png, webp) exists.
 * Replace the two placeholders below.
 */
export const TEAM_MEMBERS: readonly TeamMember[] = [
  {
    id: 'member-2',
    name: 'Second member',
    description: 'Replace this with a short description of the person.',
  },
  {
    id: 'member-1',
    name: 'First member',
    description: 'Replace this with a short description of the person.',
  },
];
