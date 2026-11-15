import type { ExplorationPath, HomeSectionCopy, TeamMember, VisualizationMethod } from '../types/home';

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
    'CosmoSPHERE is a system built for the NASA Space Apps Challenge. Pick a place in the sky, then look at what SPHEREx observed there.',
  ],
};

export const EXPLORATION_TOPIC = {
  title: 'Exploration',
  paths: [
    {
      id: 'sky-sphere',
      title: 'Explore the cosmos',
      paragraphs: [
        'On the home page, choose Explore the cosmos. A sky sphere opens, with the whole sky seen from the inside.',
        'Drag to look around. You can also switch the map between Stars and Gas and dust. Click a point: CosmoSPHERE reads its right ascension and declination. Then choose View image. The viewer opens on the latest observation, using every spectral band.',
      ],
    },
    {
      id: 'coordinates',
      title: 'Search coordinates',
      paragraphs: [
        'Choose Search coordinates. That opens Explore the Universe.',
        'Type the right ascension in hours, minutes, and seconds, and the declination in degrees. Keep the latest observation, or pick a date. Then choose a spectral band: D1 to D6 (0.75–5.00 µm) or all bands together. Submit the form to open the same viewer. From either page you can switch between Search coordinates and Sky map.',
      ],
    },
  ] as const satisfies readonly ExplorationPath[],
};

/** Fictional spectrum drawn on the home page. It is not a measured observation. */
export const CHART_EXAMPLE = {
  caption: 'Example only — not a real measurement',
  ra: '05h 49m 08.65s',
  dec: '−13° 36′ 08.0″',
  xAxis: 'Wavelength (µm)',
  yAxis: 'Flux (mJy)',
} as const;

export const VISUALIZATION_TOPIC = {
  title: 'SPHEREx Image',
  intro:
    'After you pick a place, the SPHEREx Image page opens. Choose Image or Chart. While Image is selected, you can also switch the picture between SPHEREx and DSS2.',
  methods: [
    {
      id: 'spherex',
      title: 'SPHEREx image',
      paragraphs: [
        'This is the cutout SPHEREx took at your coordinates. The target stays in the center, north is up, and every visit uses the same scale, so a change in brightness is real.',
        'The color stands for wavelength: shorter wavelengths look bluer and longer ones look redder. It is a display color, not the true color of the sky. Drag to move, and use + and − to zoom.',
      ],
    },
    {
      id: 'chart',
      title: 'Chart',
      paragraphs: [
        'Choose Chart to see the spectrum. The horizontal axis is wavelength in micrometers (µm). The vertical axis is flux in millijanskys (mJy).',
        'Each dot is one SPHEREx visit. The filter changes across the detector, so each visit measures the target at a single wavelength. The line in the example only connects the dots. It is not a real observation.',
      ],
    },
    {
      id: 'dss2',
      title: 'DSS2',
      paragraphs: [
        'With Image selected, choose DSS2. Aladin Lite shows the Digitized Sky Survey 2, a color photograph of the optical sky used as a reference. It is not a SPHEREx image.',
        'The view is centered on the coordinates you picked, and a crosshair marks that point. Drag to move and use + and − to zoom. The corner shows how wide the view is, in arcminutes.',
      ],
    },
  ] as const satisfies readonly VisualizationMethod[],
};

export const TEAM_SECTION: HomeSectionCopy = {
  id: 'team',
  title: 'Who we are',
  paragraphs: [
    'T.A.R.S. is a Brazilian team of developers who worked together to build the best system for the NASA Space Apps Challenge. The challenge we chose is “Planet X and SPHEREx”. For this, we built CosmoSPHERE, a website where you can look at any coordinate in space: just type it and explore!',
  ],
};

/** Shown above the member list, next to the team mark. */
export const TEAM_IDENTITY = {
  name: 'T.A.R.S.',
  expansion: 'Team for Advanced Research of Space',
} as const;

/**
 * Add one entry per person. Order in this array does not matter: the page sorts by name.
 * A portrait appears on the right when src/assets/team/<id>.jpg (or png, webp) exists,
 * or when homeMedia maps the id to a photo.
 */
export const TEAM_MEMBERS: readonly TeamMember[] = [
  {
    id: 'caio-sejour',
    name: 'Caio Séjour',
    description: 'Telecommunications engineer',
    href: 'https://www.linkedin.com/in/caio-s%C3%A9jour-araujo-a5b9b6147/',
  },
  {
    id: 'michael-reis',
    name: 'Michael Reis',
    description: 'Data analyst',
    href: 'https://www.linkedin.com/in/michael-dos-reis-bb7763196?utm_source=share_via&utm_content=profile&utm_medium=member_android',
  },
  {
    id: 'gustavo-valentim',
    name: 'Gustavo Valentim',
    description: 'Undergraduate student in Computer Science',
  },
  {
    id: 'raul-de-souza',
    name: 'Raul de Souza',
    description: 'High school student',
  },
];
