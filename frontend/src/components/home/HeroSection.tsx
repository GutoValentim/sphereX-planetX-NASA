import ButtonLink from '../common/ButtonLink';
import HeroBackground from './HeroBackground';
import { ROUTES } from '../../routes/paths';
import styles from './HeroSection.module.css';

function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <HeroBackground />
      <div className={styles.content}>
        <p className={styles.eyebrow}>NASA Space Apps Challenge</p>
        <h1 id="hero-title" className={styles.title}>
          Sky Explorer
        </h1>
        <p className={styles.intro}>
          Explore observations from NASA’s SPHEREx mission. Choose a position in the sky and a date, and Sky
          Explorer shows what SPHEREx observed there.
        </p>
        <ButtonLink to={ROUTES.explore} size="lg">
          Start Exploring <span aria-hidden="true">→</span>
        </ButtonLink>
      </div>
    </section>
  );
}

export default HeroSection;
