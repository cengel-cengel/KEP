/**
 * Sprint D: SwapDriverDialog nutzt jetzt SubcontractorPicker
 * (shared NV/FV-Picker mit Radius-Toggle + requireAdr).
 *
 * onPick → triggert apply-action SWAP_DRIVER mit gewählter sub-id,
 * invalidate + onClose.
 *
 * Wrap statt eigene Sub-Liste → Carlos's NV+FV-Symmetrie-Regel.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import SubcontractorPicker from '../../dialogs/SubcontractorPicker';

export default function SwapDriverDialog({
  tourId,
  currentSubId,
  requireAdr = false,
  centerLat,
  centerLng,
  onClose,
}: {
  tourId: string;
  currentSubId?: string | null;
  /** T-3.2.1: Tour enthält Hazmat → nur ADR-Subs anzeigen. */
  requireAdr?: boolean;
  /** Sprint D: Radius-Center (z.B. erster Tour-Stop lat/lng). */
  centerLat?: number | null;
  centerLng?: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (newSubId: string) => {
      const { data } = await api.post(`/nv-touren/${tourId}/apply-action`, {
        action_type: 'SWAP_DRIVER',
        new_subunternehmer_id: newSubId,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nv-touren'] });
      qc.invalidateQueries({ queryKey: ['nv-tour-detail', tourId] });
      onClose();
    },
  });
  return (
    <SubcontractorPicker
      mode="nv"
      currentSubId={currentSubId ?? null}
      requireAdr={requireAdr}
      centerLat={centerLat ?? null}
      centerLng={centerLng ?? null}
      onPick={(id) => mut.mutate(id)}
      onClose={onClose}
    />
  );
}
