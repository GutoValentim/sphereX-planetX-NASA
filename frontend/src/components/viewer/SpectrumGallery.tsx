import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import type { SpectrumGalleryData } from '../../utils/catalogMapping';
import styles from './SpectrumGallery.module.css';

interface SpectrumGalleryProps {
  data: SpectrumGalleryData | null;
  loadingMessage?: string | null;
  errorMessage?: string | null;
}

/**
 * Spectrum as charts rendered by the backend (same as the lab): every available band together,
 * then one chart per band. The band selection does not filter it.
 */
function SpectrumGallery({ data, loadingMessage, errorMessage }: SpectrumGalleryProps) {
  if (!data || (!data.combinedUrl && data.bands.length === 0)) {
    return (
      <div className={styles.center}>
        {errorMessage ? (
          <ErrorState title="Spectrum unavailable" message={errorMessage} />
        ) : (
          <LoadingState message={loadingMessage ?? 'Preparing the spectrum…'} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      <header className={styles.header}>
        <h2 className={styles.title}>Flux × wavelength</h2>
        <p className={styles.subtitle}>
          Forced photometry on every SPHEREx observation of the target. All available bands, then each band.
        </p>
      </header>
      {data.combinedUrl && (
        <figure className={styles.combined}>
          <img src={data.combinedUrl} alt="SPHEREx spectrum with every available band overlaid" />
          <figcaption>All bands · {data.bands.map((band) => band.bandId).join(' + ')}</figcaption>
        </figure>
      )}
      <div className={styles.grid}>
        {data.bands.map((band) => (
          <figure key={band.url} className={styles.card}>
            <img src={band.url} alt={`Spectrum of band ${band.bandId}`} loading="lazy" />
            <figcaption>{band.caption}</figcaption>
          </figure>
        ))}
      </div>
      <p className={styles.note}>
        The SPHEREx filter varies across the detector, so each visit measures the target at a single wavelength.
      </p>
    </div>
  );
}

export default SpectrumGallery;
