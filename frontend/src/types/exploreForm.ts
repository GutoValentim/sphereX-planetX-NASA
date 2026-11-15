export type DateMode = 'latest' | 'specific';

/** Raw form values, kept as strings exactly as typed by the user. */
export interface ExploreFormValues {
  raHours: string;
  raMinutes: string;
  raSeconds: string;
  dec: string;
  dateMode: DateMode;
  /** Date as displayed to the user (DD/MM/YYYY). */
  date: string;
  band: string;
}

export type ExploreFormField = keyof ExploreFormValues;

export type ExploreFormErrors = Partial<Record<ExploreFormField, string>>;
