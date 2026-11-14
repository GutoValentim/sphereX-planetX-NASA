import { useCallback, useState } from 'react';
import type { SpectralBandId } from '../types/observation';

/** Multi-band selection; every available band starts selected. Selection keeps the display order. */
export function useBandSelection(availableBandIds: readonly SpectralBandId[]) {
  const [selectedBandIds, setSelectedBandIds] = useState<SpectralBandId[]>(() => [...availableBandIds]);

  const toggleBand = useCallback(
    (bandId: SpectralBandId) => {
      setSelectedBandIds((current) =>
        current.includes(bandId)
          ? current.filter((id) => id !== bandId)
          : availableBandIds.filter((id) => id === bandId || current.includes(id)),
      );
    },
    [availableBandIds],
  );

  const selectAll = useCallback(() => setSelectedBandIds([...availableBandIds]), [availableBandIds]);
  const clearAll = useCallback(() => setSelectedBandIds([]), []);

  return { selectedBandIds, toggleBand, selectAll, clearAll };
}
