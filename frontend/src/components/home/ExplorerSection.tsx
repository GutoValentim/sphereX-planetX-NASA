import { ChartIcon, ImageIcon } from '../common/icons';
import { EXPLORER_FEATURES, EXPLORER_SECTION } from '../../constants/homeContent';
import type { ExplorerFeature, ExplorerFeatureExample } from '../../types/home';
import HomePanel from './HomePanel';
import styles from './ExplorerSection.module.css';

const FEATURE_ICONS: Record<ExplorerFeatureExample, typeof ImageIcon> = {
  image: ImageIcon,
  chart: ChartIcon,
};

function FeatureExample({ kind }: { kind: ExplorerFeatureExample }) {
  if (kind === 'image') {
    return (
      <div className={styles.sky} aria-hidden="true">
        <span className={styles.reticle} />
      </div>
    );
  }

  return (
    <svg className={styles.chart} viewBox="0 0 160 96" aria-hidden="true">
      <path className={styles.chartAxis} d="M16 12v68h132" />
      <path className={styles.chartLine} d="M24 62l28-24 24 16 28-30 32 10" />
      <circle className={styles.chartPoint} cx="52" cy="38" r="3" />
      <circle className={styles.chartPoint} cx="76" cy="54" r="3" />
      <circle className={styles.chartPoint} cx="104" cy="24" r="3" />
    </svg>
  );
}

function FeatureRow({ feature }: { feature: ExplorerFeature }) {
  const Icon = FEATURE_ICONS[feature.example];

  return (
    <li className={styles.feature}>
      <div className={styles.featureCopy}>
        <span className={styles.icon}>
          <Icon />
        </span>
        <div>
          <h3 className={styles.featureTitle}>{feature.title}</h3>
          <p className={styles.featureText}>{feature.description}</p>
        </div>
      </div>
      <figure className={styles.example}>
        <FeatureExample kind={feature.example} />
        <figcaption className={styles.caption}>Example</figcaption>
      </figure>
    </li>
  );
}

function ExplorerSection() {
  const { id, title, paragraphs } = EXPLORER_SECTION;

  return (
    <HomePanel id={id} title={title}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className={styles.intro}>
          {paragraph}
        </p>
      ))}
      <ul className={styles.features}>
        {EXPLORER_FEATURES.map((feature) => (
          <FeatureRow key={feature.id} feature={feature} />
        ))}
      </ul>
    </HomePanel>
  );
}

export default ExplorerSection;
