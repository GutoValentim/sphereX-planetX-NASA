export interface HomeSectionCopy {
  id: string;
  title: string;
  paragraphs: readonly string[];
}

export type ExplorerFeatureExample = 'image' | 'chart';

export interface ExplorerFeature {
  id: string;
  title: string;
  description: string;
  example: ExplorerFeatureExample;
}

/** One person on the Home page. The list is shown in alphabetical order by name. */
export interface TeamMember {
  /** Also the file name (without extension) of an optional portrait in src/assets/team/. */
  id: string;
  name: string;
  description: string;
}
