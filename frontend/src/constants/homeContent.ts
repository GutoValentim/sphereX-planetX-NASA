import type { ExplorerFeature, HomeSectionCopy, TeamMember } from '../types/home';

/** Provisional copy. The final texts will be provided by the team. */
export const SPHEREX_SECTION: HomeSectionCopy = {
  id: 'spherex',
  title: 'What is SPHEREx?',
  paragraphs: [
    'SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) is a NASA astrophysics mission that conducts the first-ever all-sky near-infrared spectral survey. By capturing data in over 100 different wavelength bands, the observatory maps hundreds of millions of galaxies and stars. This unprecedented wide-field approach helps scientists study the rapid expansion of the universe following the Big Bang and understand how cosmic structures first formed.',
    'The mission centers around three primary scientific goals: exploring the origin of the universe, tracking the history of galaxy evolution, and measuring the distribution of water and other essential prebiotic molecules in interstellar ice. Over its planned operational lifetime, SPHEREx maps the entire sky multiple times to build detailed legacy catalogs. These findings provide valuable, broad-scale context that complements deeper, targeted observations made by instruments like the James Webb Space Telescope.',
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
    title: 'SPHEREx image',
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
