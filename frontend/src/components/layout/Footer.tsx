import nasaLogoUrl from '../../assets/images/logos/NASA_logo_(2023_colors).svg.webp';
import spaceAppsLogoUrl from '../../assets/images/logos/space_apps_003.webp';
import { FOOTER_CREDITS, FOOTER_LINKS, FOOTER_PARTNERS } from '../../constants/siteLinks';
import styles from './Footer.module.css';

const PARTNER_LOGOS: Readonly<Record<string, string>> = {
  'https://www.nasa.gov/': nasaLogoUrl,
  'https://www.spaceappschallenge.org/': spaceAppsLogoUrl,
};

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
        <ul className={styles.partners}>
          {FOOTER_PARTNERS.map((partner) => (
            <li key={partner.href}>
              <a href={partner.href} target="_blank" rel="noopener noreferrer" className={styles.partner}>
                <img
                  src={PARTNER_LOGOS[partner.href]}
                  alt=""
                  className={
                    partner.href.includes('spaceappschallenge.org')
                      ? `${styles.partnerLogo} ${styles.spaceAppsLogo}`
                      : styles.partnerLogo
                  }
                />
                <span className={styles.partnerLabel}>
                  {partner.label}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
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
