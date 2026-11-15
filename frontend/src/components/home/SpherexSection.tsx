import { SPHEREX_SECTION } from '../../constants/homeContent';
import { SPHEREX_TRAJECTORY_VIDEO } from '../../constants/homeMedia';
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
          <video
            className={styles.media}
            controls
            playsInline
            preload="none"
            poster={SPHEREX_TRAJECTORY_VIDEO.poster}
          >
            <source src={SPHEREX_TRAJECTORY_VIDEO.src} type="video/mp4" />
          </video>
          <figcaption className={styles.caption}>
            This video provides an engaging visual overview of how the SPHEREx observatory maps the cosmos using
            near-infrared light. Credit: NASA/JPL-Caltech.
          </figcaption>
        </figure>
      </div>
    </HomePanel>
  );
}

export default SpherexSection;
