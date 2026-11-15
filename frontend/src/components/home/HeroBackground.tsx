import { useState } from 'react';
import { HERO_IMAGES } from '../../constants/heroImages';
import { useTheme } from '../../hooks/useTheme';
import styles from './HeroBackground.module.css';

/** Decorative hero backdrop: themed gradients with drifting glows, plus the theme's photograph when provided. */
function HeroBackground() {
  const { theme } = useTheme();
  const image = HERO_IMAGES[theme];
  const [loadedImage, setLoadedImage] = useState<string | null>(null);

  return (
    <div className={styles.background} aria-hidden="true">
      <div className={styles.glow} />
      {image && (
        <>
          <img
            key={image}
            src={image}
            alt=""
            className={styles.photo}
            data-loaded={loadedImage === image}
            decoding="async"
            fetchPriority="high"
            onLoad={() => setLoadedImage(image)}
          />
          <div className={styles.overlay} />
        </>
      )}
    </div>
  );
}

export default HeroBackground;
