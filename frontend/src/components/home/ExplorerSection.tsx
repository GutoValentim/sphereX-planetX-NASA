import { ChartIcon, ImageIcon, RecenterIcon } from '../common/icons';
import skyMapUrl from '../../assets/images/photos/imagem-mapa-cosmico.png';
import spherexImageUrl from '../../assets/images/photos/foto-spherex-image.jpeg';
import dss2Url from '../../assets/images/photos/aladin-dss2.png';
import {
  CHART_EXAMPLE,
  EXPLORATION_TOPIC,
  EXPLORER_SECTION,
  VISUALIZATION_TOPIC,
} from '../../constants/homeContent';
import type { VisualizationExample } from '../../types/home';
import HomePanel from './HomePanel';
import styles from './ExplorerSection.module.css';

const METHOD_ICONS = {
  spherex: ImageIcon,
  chart: ChartIcon,
  dss2: RecenterIcon,
} as const;

const METHOD_IMAGES: Partial<Record<VisualizationExample, { src: string; alt: string }>> = {
  spherex: {
    src: spherexImageUrl,
    alt: 'SPHEREx false-color image: a bright target with stars shown in several colors.',
  },
  dss2: {
    src: dss2Url,
    alt: 'Aladin DSS2 view of a star field, with a crosshair on the selected coordinates.',
  },
};

/** Fictional flux-versus-wavelength chart. Axis units match the spectrum viewer. */
function ExampleChart() {
  return (
    <svg className={styles.chart} viewBox="0 0 320 188" role="img" aria-label={CHART_EXAMPLE.caption}>
      <text className={styles.chartAxisLabel} x="8" y="86" transform="rotate(-90 8 86)">
        {CHART_EXAMPLE.yAxis}
      </text>
      <path className={styles.chartAxis} d="M52 16v124h252" />
      <path className={styles.chartGrid} d="M52 95.7h252M52 51.4h252" />
      <path className={styles.chartLine} d="M62.1 85.1l26.1-25.3 39.1-15.5 64.1 21.3 60.4 24.8 35.1 12.4" />
      {[
        [62.1, 85.1],
        [88.2, 59.8],
        [127.3, 44.3],
        [191.4, 65.6],
        [251.8, 90.4],
        [286.9, 102.8],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <path className={styles.chartError} d={`M${cx} ${cy - 6.6}v13.2`} />
          <circle className={styles.chartPoint} cx={cx} cy={cy} r="3.2" />
        </g>
      ))}
      {[
        ['0', 140],
        ['10', 95.7],
        ['20', 51.4],
      ].map(([label, y]) => (
        <text key={label} className={styles.chartTick} x="46" y={Number(y) + 3} textAnchor="end">
          {label}
        </text>
      ))}
      {[
        ['1', 66.8],
        ['2', 126.1],
        ['3', 185.4],
        ['4', 244.7],
        ['5', 304],
      ].map(([label, x]) => (
        <text key={label} className={styles.chartTick} x={x} y="156" textAnchor="middle">
          {label}
        </text>
      ))}
      <text className={styles.chartAxisLabel} x="178" y="176" textAnchor="middle">
        {CHART_EXAMPLE.xAxis}
      </text>
    </svg>
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

      <section className={styles.topic} aria-labelledby="exploration-title">
        <h3 id="exploration-title" className={styles.topicTitle}>
          {EXPLORATION_TOPIC.title}
        </h3>
        <div className={styles.split}>
          <div className={styles.paths}>
            {EXPLORATION_TOPIC.paths.map((path) => (
              <div key={path.id}>
                <h4 className={styles.pathTitle}>{path.title}</h4>
                {path.paragraphs.map((paragraph) => (
                  <p key={paragraph} className={styles.text}>
                    {paragraph}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <figure className={styles.figure}>
            <img
              src={skyMapUrl}
              alt="Sky sphere: the Milky Way across an all-sky map, with a crosshair at the center."
              className={styles.shot}
            />
            <figcaption className={styles.caption}>Sky sphere — drag, click a point, then open the image</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.topic} aria-labelledby="visualization-title">
        <h3 id="visualization-title" className={styles.topicTitle}>
          {VISUALIZATION_TOPIC.title}
        </h3>
        <p className={styles.text}>{VISUALIZATION_TOPIC.intro}</p>
        <ul className={styles.methods}>
          {VISUALIZATION_TOPIC.methods.map((method) => {
            const Icon = METHOD_ICONS[method.id];
            const image = METHOD_IMAGES[method.id];
            return (
              <li key={method.id} className={styles.method}>
                <div className={styles.methodCopy}>
                  <span className={styles.icon}>
                    <Icon />
                  </span>
                  <div>
                    <h4 className={styles.pathTitle}>{method.title}</h4>
                    {method.paragraphs.map((paragraph) => (
                      <p key={paragraph} className={styles.text}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
                <figure className={styles.figure}>
                  {image ? (
                    <img src={image.src} alt={image.alt} className={styles.shot} />
                  ) : (
                    <ExampleChart />
                  )}
                  <figcaption className={styles.caption}>
                    {method.id === 'chart' ? (
                      <>
                        {CHART_EXAMPLE.caption}. RA {CHART_EXAMPLE.ra}, Dec {CHART_EXAMPLE.dec}.{' '}
                        {CHART_EXAMPLE.xAxis} · {CHART_EXAMPLE.yAxis}.
                      </>
                    ) : (
                      method.title
                    )}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      </section>
    </HomePanel>
  );
}

export default ExplorerSection;
