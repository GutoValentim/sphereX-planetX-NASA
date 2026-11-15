export interface HomeSectionCopy {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export interface ExplorationPath {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export type VisualizationExample = 'spherex' | 'chart' | 'dss2';

export interface VisualizationMethod {
  id: VisualizationExample;
  title: string;
  paragraphs: readonly string[];
}

/** One person on the Home page. The list is shown in alphabetical order by name. */
export interface TeamMember {
  /** Also the file name (without extension) of an optional portrait in src/assets/team/. */
  id: string;
  name: string;
  description: string;
  /** Public profile, when the member has one. */
  href?: string;
}
