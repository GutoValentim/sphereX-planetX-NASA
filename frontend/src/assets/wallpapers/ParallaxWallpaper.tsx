import { useEffect, useRef, type CSSProperties } from 'react';
import cloud1 from '../images/cloud1.png';
import cloud2 from '../images/cloud2.png';
import cloud3 from '../images/cloud3.png';
import cloud4 from '../images/cloud 4.png';
import cloud5 from '../images/cloud 5.png';
import skyWallpaper from '../images/sky-wallpaper.jpg';
import universeWallpaper from '../images/universe-wallpaper.jpg';
import './parallax.css';

/** Tops are 280–320px apart. Edge lanes stay beside the hero text; lower ones cross the page. */
const CLOUDS = [
  { src: cloud1, top: 110, duration: 3.6, delay: -1, width: 130, edge: 'left' },
  { src: cloud2, top: 400, duration: 4, delay: -2, width: 150, edge: 'right' },
  { src: cloud3, top: 700, duration: 3.2, delay: -0.5, width: 120, edge: 'left' },
  { src: cloud4, top: 1000, duration: 46, delay: -12, width: 240, edge: 'full' },
  { src: cloud5, top: 1320, duration: 62, delay: -20, width: 200, edge: 'full' },
] as const;

/** Fraction of the scroll distance the wallpaper travels, so it lags behind the page. */
const SHIFT_FACTOR = 0.18;
/** Keeps the oversized photo inside the clipped section. */
const SHIFT_LIMIT_RATIO = 0.12;

function ParallaxWallpaper() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) {
      return;
    }

    let frame = 0;

    const applyShift = () => {
      frame = 0;
      const limit = window.innerHeight * SHIFT_LIMIT_RATIO;
      const shift = Math.min(window.scrollY * SHIFT_FACTOR, limit);
      section.style.setProperty('--parallax-shift', `${shift}px`);
    };

    const onScroll = () => {
      if (frame !== 0) {
        return;
      }
      frame = window.requestAnimationFrame(applyShift);
    };

    applyShift();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <>
    <div ref={sectionRef} className="secao-parallax" aria-hidden="true">
      <div className="secao-parallax__layer">
        <img className="secao-parallax__image secao-parallax__image--sky" src={skyWallpaper} alt="" />
        <img
          className="secao-parallax__image secao-parallax__image--universe"
          src={universeWallpaper}
          alt=""
        />
      </div>
    </div>
    <div className="clouds" aria-hidden="true">
      {CLOUDS.map((cloud) => (
        <img
          key={cloud.src}
          src={cloud.src}
          alt=""
          className={`cloud cloud--${cloud.edge}`}
          style={
            {
              '--cloud-top': `${cloud.top}px`,
              '--cloud-duration': `${cloud.duration}s`,
              '--cloud-delay': `${cloud.delay}s`,
              '--cloud-width': `${cloud.width}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
    </>
  );
}

export default ParallaxWallpaper;
