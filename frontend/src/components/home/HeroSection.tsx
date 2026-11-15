import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ButtonLink from '../common/ButtonLink';
import HeroBackground from './HeroBackground';
import { ROUTES } from '../../routes/paths';
import styles from './HeroSection.module.css';

function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const backdrop = document.getElementById('hero-backdrop');

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !backdrop) {
      return;
    }

    const syncHeight = () => {
      backdrop.style.height = `${section.offsetHeight}px`;
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(section);
    return () => observer.disconnect();
  }, [backdrop]);

  return (
    <section ref={sectionRef} className={styles.hero} aria-labelledby="hero-title">
      {backdrop ? createPortal(<HeroBackground />, backdrop) : null}
      <div className={styles.content}>
        <p className={styles.eyebrow}>T.A.R.S - Team for Advanced Research of Space</p>
        <h1 id="hero-title" className={styles.title}>
          CosmoSPHERE
        </h1>
        <h1 id="hero-subtitle" className={styles.brand}>
          SPHEREx Explorer
        </h1>
        <p className={styles.intro}>
          Explore observations from NASA’s SPHEREx mission. Choose a position in the sky and a date, and Sky
          Explorer shows what SPHEREx observed there.
        </p>
        <div className={styles.actions}>
          <ButtonLink to={ROUTES.sky} size="lg">
            Explore the sky <span aria-hidden="true">→</span>
          </ButtonLink>
          <ButtonLink to={ROUTES.explore} variant="secondary" size="lg">
            Search coordinates
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
