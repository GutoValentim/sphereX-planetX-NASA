import type { ExternalLink } from '../types/links';

export const FOOTER_LINKS: readonly ExternalLink[] = [
  { label: 'NASA SPHEREx mission', href: 'https://science.nasa.gov/mission/spherex/' },
  { label: 'SPHEREx at NASA/IPAC IRSA', href: 'https://irsa.ipac.caltech.edu/Missions/spherex.html' },
  { label: 'NASA Space Apps Challenge', href: 'https://www.spaceappschallenge.org/' },
];

/** Official marks shown in the footer. Each one links to that organization's site. */
export const FOOTER_PARTNERS: readonly ExternalLink[] = [
  { label: 'NASA', href: 'https://www.nasa.gov/' },
  { label: 'NASA Space Apps Challenge', href: 'https://www.spaceappschallenge.org/' },
];

/** Credits required by the third-party data and software shown in the viewer. */
export const FOOTER_CREDITS: readonly string[] = [
  'Reference imagery: Digitized Sky Survey (STScI/NASA), colored and HEALPix-ed by CDS, served by NASA/IPAC IRSA.',
  'Sky viewer powered by Aladin Lite (CDS, Strasbourg). Charts by Plotly.',
];
