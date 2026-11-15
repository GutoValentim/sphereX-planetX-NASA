import { FOOTER_CREDITS, FOOTER_LINKS } from '../../constants/siteLinks';
import styles from './Footer.module.css';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.identity}>
            <p className={styles.name}>SPHEREx - Sky and Time Explorer</p>
            <p className={styles.event}>NASA Space Apps Challenge · {currentYear}</p>
          </div>
          <nav aria-label="Related links">
            <ul className={styles.links}>
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
                    {link.label}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className={styles.credits}>
          {FOOTER_CREDITS.map((credit) => (
            <p key={credit}>{credit}</p>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default Footer;
