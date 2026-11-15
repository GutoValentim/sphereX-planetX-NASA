import styles from './MonochromePanel.module.css';

interface MonochromePanelProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

/** Same frames as the color view, rendered by the backend as black and white. */
function MonochromePanel({ enabled, onChange }: MonochromePanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="mono-panel-title">
      <h2 id="mono-panel-title" className={styles.title}>
        Monochrome
      </h2>
      <label className={styles.option}>
        <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked)} />
        <span>Black and white</span>
      </label>
      <p className={styles.note}>Shows the same observation without the false-color tint.</p>
    </section>
  );
}

export default MonochromePanel;
