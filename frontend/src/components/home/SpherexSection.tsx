import { SPHEREX_TRAJECTORY_GIF } from '../../constants/homeMedia';
import { SPHEREX_SECTION } from '../../constants/homeContent';
import HomePanel from './HomePanel';
import styles from './SpherexSection.module.css';

function SpherexSection() {
  const { id, title, paragraphs } = SPHEREX_SECTION;

  return (
    <HomePanel id={id} title={title}>
      <div className={styles.layout}>
        <div className={styles.copy}>
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className={styles.text}>
              {paragraph}
            </p>
          ))}
        </div>
        <figure className={styles.figure}>
          {SPHEREX_TRAJECTORY_GIF ? (
            <img src={SPHEREX_TRAJECTORY_GIF} alt="Trajectory of the SPHEREx satellite" className={styles.media} />
          ) : (
            <div className={styles.slot} role="img" aria-label="Space reserved for the SPHEREx trajectory animation">
              <span className={styles.slotLabel}>Trajectory animation</span>
              <span className={styles.slotHint}>A GIF of the satellite’s path will be placed here.</span>
            </div>
          )}
        </figure>
      </div>
    </HomePanel>
  );
}

export default SpherexSection;
