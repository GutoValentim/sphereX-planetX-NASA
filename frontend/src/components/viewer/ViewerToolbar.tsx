import { MinusIcon, PlusIcon } from '../common/icons';
import styles from './ViewerToolbar.module.css';

interface ViewerToolbarProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** Explains why the controls are disabled, e.g. while the viewer is unavailable. */
  disabledReason?: string;
}

function ViewerToolbar({ onZoomIn, onZoomOut, disabledReason }: ViewerToolbarProps) {
  const disabled = Boolean(disabledReason) || !onZoomIn || !onZoomOut;

  return (
    <div role="group" aria-label="Zoom" className={styles.toolbar} title={disabledReason}>
      <button type="button" className={styles.button} onClick={onZoomIn} disabled={disabled} aria-label="Zoom in">
        <PlusIcon />
      </button>
      <span className={styles.divider} aria-hidden="true" />
      <button type="button" className={styles.button} onClick={onZoomOut} disabled={disabled} aria-label="Zoom out">
        <MinusIcon />
      </button>
    </div>
  );
}

export default ViewerToolbar;
