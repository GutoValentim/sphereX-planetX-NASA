import type { ObservationFrame, ObservationQuery, SpectralBandOption } from '../../types/observation';
import { formatDegrees, formatRaHms, raDegreesToHms } from '../../utils/coordinateConversion';
import { formatUtcDateTime, isoToDisplayDate } from '../../utils/dateFormatting';
import styles from './ObservationMetadata.module.css';

interface ObservationMetadataProps {
  query: ObservationQuery;
  requestedBandLabel: string;
  selectedBands: readonly SpectralBandOption[];
  activeObservation: ObservationFrame | null;
  isDemoObservation: boolean;
}

interface MetadataItem {
  label: string;
  /** null means the value depends on backend data that is not available yet. */
  value: string | null;
  /** Marks values that come from development placeholders. */
  isDemo?: boolean;
}

function ObservationMetadata({
  query,
  requestedBandLabel,
  selectedBands,
  activeObservation,
  isDemoObservation,
}: ObservationMetadataProps) {
  const observedAt = activeObservation ? formatUtcDateTime(activeObservation.observedAt) : null;

  const items: MetadataItem[] = [
    {
      label: 'Right Ascension',
      value: `${formatRaHms(raDegreesToHms(query.raDeg))} (${formatDegrees(query.raDeg)})`,
    },
    { label: 'Declination', value: formatDegrees(query.decDeg, 4, true) },
    {
      label: 'Requested date',
      value: query.observationDate ? isoToDisplayDate(query.observationDate) : 'Latest available',
    },
    { label: 'Requested band', value: requestedBandLabel },
    {
      label: 'Selected bands',
      value: selectedBands.length > 0 ? selectedBands.map((band) => band.label).join(', ') : 'None',
    },
    { label: 'Observation date', value: observedAt?.date ?? null, isDemo: isDemoObservation },
    { label: 'Observation time', value: observedAt?.time ?? null, isDemo: isDemoObservation },
    { label: 'Observation ID', value: activeObservation?.id ?? null, isDemo: isDemoObservation },
  ];

  return (
    <section className={styles.metadata} aria-labelledby="observation-metadata-title">
      <h2 id="observation-metadata-title" className={styles.title}>
        Observation details
      </h2>
      <dl className={styles.list}>
        {items.map(({ label, value, isDemo }) => (
          <div key={label} className={styles.item}>
            <dt className={styles.label}>{label}</dt>
            <dd className={value === null ? `${styles.value} ${styles.pending}` : styles.value}>
              {value ?? 'Not available yet'}
              {value !== null && isDemo && <span className={styles.demoTag}>demo</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        SPHEREx (NASA/IPAC IRSA) · false color by wavelength · aligned to a common grid, north up, target at the center.
      </p>
    </section>
  );
}

export default ObservationMetadata;
