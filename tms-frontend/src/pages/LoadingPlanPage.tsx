import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import LoadingPlan3D from '../components/LoadingPlan3D';
import AxleLoadPanel from '../components/AxleLoadPanel';
import ContextMenu, {
  type ContextMenuItem,
} from '../components/loadingplan/ContextMenu';
import { api } from '../lib/api';
import { computeStackingLdmMetrics } from '../lib/loadingLdm';
import {
  placePackages,
  sortPackagesForOptimalPack,
} from '../lib/loadingShared';
import { useInsertMode } from '../hooks/useInsertMode';
import InsertModeBanner from '../components/loadingplan/InsertModeBanner';
import {
  computeInsertedOrder,
  findInsertTarget,
} from '../lib/insertCascade';
// F①-a: FV-shared types + helpers (vorher inline in dieser Datei).
// LoadingPlanPanel.FvBody wird in F①-c dieselben Symbole konsumieren.
import {
  DEFAULT_TRAILER_CM,
  STOP_COLORS,
  VEHICLES,
  expandPackagesFromOrder,
  matchVehicleType,
  type OptimizeResponse,
  type PlacedPackage,
  type ShipmentLoad,
} from '../lib/loadingFv';

/** Sattelzug-Standard, Vehicle-List, Type-Definitions + expand-
 *  Helper sind nach lib/loadingFv.ts gewandert (F①-a). KEIN
 *  Verhaltenswechsel. */

// F1.b: rectsOverlap2D / getStackHeight / findPreferredStackSlot /
// sortPackagesForOptimalPack / placePackages sind nach
// lib/loadingShared.ts gewandert (bit-identische 1:1-Kopie). NV wird
// sie in F2 (per-Subset-Effektiv-ldm) ebenfalls konsumieren.

function trailerVolumeCm3(L: number, W: number, H: number): number {
  return L * W * H;
}

function packagesVolumeCm3(packs: PlacedPackage[]): number {
  let v = 0;
  for (const p of packs) {
    v += p.lengthCm * p.widthCm * p.heightCm;
  }
  return v;
}

/** Quader: x,y,z = Ecke unten-hinten-links in Trailer-Koordinaten; dx=Breite, dy=Tiefe, dz=Höhe */

export default function LoadingPlanPage() {
  const { tourId } = useParams<{ tourId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // B-2 Insert-Mode page-local state.
  const insertMode = useInsertMode();
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [manualPosById, setManualPosById] = useState<
    Record<string, { xPosCm: number; yPosCm: number; rotationAngle: number; stackLevel: number }>
  >({});
  // Phase G: viewMode entfernt — nur LoadingPlan3D bleibt.
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>('Sattel');
  const [removedShipmentIds, setRemovedShipmentIds] = useState<string[]>([]);
  // B-1 SCHRITT 3: Right-Click Context-Menu State (Pkg-Mesh-Right-Click).
  const [ctxMenu, setCtxMenu] = useState<
    { shipmentId: string; x: number; y: number } | null
  >(null);

  const optimizeQuery = useQuery({
    queryKey: ['loading', 'optimize', tourId],
    enabled: !!tourId,
    queryFn: async () => {
      const { data } = await api.get<OptimizeResponse>(`/loading/tour/${tourId}/optimize`);
      return data;
    },
    retry: 1,
  });

  const optimizeErrorText = (() => {
    const err = optimizeQuery.error as
      | { response?: { data?: { message?: string } }; message?: string }
      | undefined;
    if (!err) return '';
    const msg =
      err.response?.data &&
      typeof err.response.data === 'object' &&
      'message' in err.response.data &&
      typeof (err.response.data as { message?: string }).message === 'string'
        ? (err.response.data as { message: string }).message
        : err.message;
    return msg || 'Unbekannter Fehler';
  })();

  const effectiveOrder = useMemo(() => {
    const base = optimizeQuery.data?.loadingOrder ?? [];
    if (!manualOrder) return base;
    const map = new Map(base.map((s) => [s.id, s]));
    const fromManual = manualOrder.map((id) => map.get(id)).filter(Boolean) as ShipmentLoad[];
    const missing = base.filter((s) => !manualOrder.includes(s.id));
    return [...fromManual, ...missing];
  }, [optimizeQuery.data?.loadingOrder, manualOrder]);

  const activeOrder = useMemo(
    () => effectiveOrder.filter((s) => !removedShipmentIds.includes(s.id)),
    [effectiveOrder, removedShipmentIds],
  );

  const selectedVehicle = useMemo(() => {
    const byType = VEHICLES.find((v) => v.type === selectedVehicleType);
    if (byType) return byType;
    return optimizeQuery.data?.recommendedVehicle ?? VEHICLES[5];
  }, [selectedVehicleType, optimizeQuery.data?.recommendedVehicle]);

  const vehicleDims = useMemo(() => {
    const v = selectedVehicle;
    if (!v) return DEFAULT_TRAILER_CM;
    return {
      lengthCm: v.lengthCm > 0 ? v.lengthCm : DEFAULT_TRAILER_CM.lengthCm,
      widthCm: v.widthCm > 0 ? v.widthCm : DEFAULT_TRAILER_CM.widthCm,
      heightCm: v.heightCm > 0 ? v.heightCm : DEFAULT_TRAILER_CM.heightCm,
    };
  }, [selectedVehicle]);

  const packagesFlat = useMemo(() => expandPackagesFromOrder(activeOrder), [activeOrder]);



  // S-6.3 A-Fix: Default-Ansicht laeuft jetzt mit Carlos-Stack-Rule-
  // Sortierung vor placePackages (vorher nur im Repack-Optimal-Knopf
  // explizit, Default war DB-Reihenfolge → suboptimal). Symmetrisch
  // zur NV-flattenPackages-Aenderung.
  const placedPackages = useMemo(
    () => {
      const sorted = sortPackagesForOptimalPack(packagesFlat);
      const r = placePackages(
        sorted,
        vehicleDims.lengthCm,
        vehicleDims.widthCm,
        vehicleDims.heightCm,
      );
      return r;
    },
    [packagesFlat, vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm],
  );

  const volUtil = useMemo(() => {
    const tv = trailerVolumeCm3(vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm);
    const cv = packagesVolumeCm3(placedPackages);
    if (tv <= 0) return 0;
    return (cv / tv) * 100;
  }, [placedPackages, vehicleDims]);

  const maxLdmDisplay = useMemo(() => {
    const v = selectedVehicle;
    return v?.maxLdm && v.maxLdm > 0 ? v.maxLdm : 13.6;
  }, [selectedVehicle]);

  const maxWeightDisplay = useMemo(() => {
    const v = selectedVehicle;
    return v?.maxWeightKg && v.maxWeightKg > 0 ? v.maxWeightKg : 24000;
  }, [selectedVehicle]);

  const ldmMetrics = useMemo(
    () => computeStackingLdmMetrics(maxLdmDisplay, activeOrder),
    [maxLdmDisplay, activeOrder],
  );

  const weightUtil = useMemo(() => {
    const totalW = activeOrder.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0);
    if (maxWeightDisplay <= 0) return null;
    return (totalW / maxWeightDisplay) * 100;
  }, [activeOrder, maxWeightDisplay]);

  const trailerVolM3 = useMemo(() => {
    const v = trailerVolumeCm3(vehicleDims.lengthCm, vehicleDims.widthCm, vehicleDims.heightCm);
    return v / 1e6;
  }, [vehicleDims]);

  // BUG-F-PACK: Paket-Set fuer 3D-Render + Achslast = nur platzierte.
  // Unplaced-Pakete passen physisch nicht in Trailer; werden im
  // Banner gezaehlt + nicht gerendert (sonst Durchdringung). Vol/
  // Gewicht-Auslastung bleibt auf ALLEN Paketen — sonst verschleiert
  // die Anzeige genau die Ueberlast, die das Unplaced ausgeloest hat.
  const renderedPackages = useMemo(
    () => placedPackages.filter((p) => !p.unplaced),
    [placedPackages],
  );
  // Regel #2: betroffen = Sendung mit MIND. 1 unplaced Packstück.
  // Aggregation auf shipmentId (statt Packstueck-Zaehlung).
  const unplacedShipmentCount = useMemo(
    () =>
      new Set(
        placedPackages.filter((p) => p.unplaced).map((p) => p.shipmentId),
      ).size,
    [placedPackages],
  );

  const cargoVolM3 = useMemo(() => packagesVolumeCm3(placedPackages) / 1e6, [placedPackages]);
  const totalWeightActive = useMemo(
    () => activeOrder.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0),
    [activeOrder],
  );
  // O-2: Carlos-Klaerung — Ueberladen = Vol > 100% ODER Gewicht > 100%.
  // ldm (Boden + Effektiv) ist Info, kein Trigger mehr.
  const isOverloaded =
    volUtil > 100 || (weightUtil != null && weightUtil > 100);


  const applyOrderMutation = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      const { data } = await api.post(`/loading/tour/${tourId}/apply-order`, { shipmentIds });
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] }),
        queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] }),
        queryClient.invalidateQueries({ queryKey: ['shipments'] }),
        queryClient.invalidateQueries({ queryKey: ['tours'] }),
      ]);
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (payload: {
      items: Array<{
        shipmentId: string;
        xPosCm: number;
        yPosCm: number;
        rotationAngle?: number;
        stackLevel?: number;
      }>;
    }) => {
      const { data } = await api.post(`/loading/tour/${tourId}/draft`, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
    },
  });

  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 2500);
  }

  const persistItemPositionMutation = useMutation({
    mutationFn: async (vars: {
      itemId: string;
      /** H5a: 0..quantity-1; default 0. */
      paletteIndex?: number;
      posXCm: number;
      posYCm: number;
      posZCm: number;
      rotationDeg?: number;
    }) => {
      const { itemId, paletteIndex, posXCm, posYCm, posZCm, rotationDeg } =
        vars;
      const body: Record<string, number> = {
        posXCm: Math.round(posXCm),
        posYCm: Math.round(posYCm),
        posZCm: Math.round(posZCm),
        paletteIndex: paletteIndex ?? 0,
      };
      if (rotationDeg !== undefined) body.rotationDeg = Math.round(rotationDeg);
      await api.patch(`/loading/package-item/${itemId}/position`, body);
    },
    onSuccess: () => {
      showToast('Position gespeichert');
    },
    onError: (e) => {
      // eslint-disable-next-line no-console
      console.warn('persistItemPosition failed:', e);
      showToast('Speichern fehlgeschlagen', 'err');
    },
    // P0-12 BUG-1: invalidate, damit BE-persisted rotation_deg in
    // optimizeQuery.packageItems landet → LoadingPlan3D rendert
    // korrekte Rotation nach Drop (sonst snapped es zurück).
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
    },
  });

  const resetPositionsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/loading/tour/${tourId}/reset-positions`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
      showToast('Positionen zurückgesetzt');
    },
    onError: () => {
      showToast('Reset fehlgeschlagen', 'err');
    },
  });

  // B-1 SCHRITT 4: "Neu optimal beladen" — Re-Pack mit Carlos-Stack-Rule.
  //   Sort: non-stackable first (Boden), weight-desc, volume-desc
  //   Run placePackages mit neuer Order, PATCH alle Positionen,
  //   Reset storedPos via /reset-positions vorher (Cache-clear BE).
  const repackOptimalMutation = useMutation({
    mutationFn: async () => {
      if (!tourId) throw new Error('Keine Tour-ID');
      // 1. Reset BE-Positionen → Auto-Placer-Cache leeren.
      await api.post(`/loading/tour/${tourId}/reset-positions`);
      // 2. Sort packagesFlat per Carlos-Rule (non-stackable→Boden,
      //    weight-desc, volume-desc).
      const sorted = sortPackagesForOptimalPack(packagesFlat);
      // 3. Re-Pack mit neuer Sortierung.
      const repacked = placePackages(
        sorted,
        vehicleDims.lengthCm,
        vehicleDims.widthCm,
        vehicleDims.heightCm,
      );
      // 4. PATCH jede neue Position auf BE.
      //    (Bugfix Teil A: pkg.rotationDeg statt hardcode 0 —
      //     sonst nukes Re-Pack alle Rotationen, die User per
      //     R-Hotkey gesetzt hat.)
      //    BUG-F-PACK: unplaced NICHT persistieren — sonst landen
      //    Phantom-Positionen (0/0/0) in der DB.
      let written = 0;
      for (const pkg of repacked) {
        if (!pkg.dbItemId) continue; // synth-Fallback ohne BE-Item
        if (pkg.unplaced) continue;
        // H5a: PATCH pro Klon mit paletteIndex.
        await api.patch(`/loading/package-item/${pkg.dbItemId}/position`, {
          paletteIndex: pkg.paletteIndex ?? 0,
          posXCm: Math.round(pkg.posX),
          posYCm: Math.round(pkg.posY),
          posZCm: Math.round(pkg.posZ),
          rotationDeg: pkg.rotationDeg ?? 0,
        });
        written += 1;
      }
      return { count: written };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
      showToast(`Optimal beladen: ${res.count} Packstücke`);
    },
    onError: (e) => {
      // eslint-disable-next-line no-console
      console.warn('repackOptimal failed:', e);
      showToast('Optimal-Pack fehlgeschlagen', 'err');
    },
  });

  // B-1 SCHRITT 2: Stapelbarkeit-Toggle pro Sendung.
  // Optimistic: setQueryData mit invertiertem isStackable + alle
  // packageItems.stackable. BE PATCH /shipments/:id/stackable
  // setzt alle pkg-items der Sendung (Carlos-Konvention).
  // Auto-Recompute: placePackages-useMemo re-runs auf packages-Change.
  const setShipmentStackableMutation = useMutation({
    mutationFn: async (vars: { shipmentId: string; stackable: boolean }) => {
      await api.patch(`/shipments/${vars.shipmentId}/stackable`, {
        stackable: vars.stackable,
      });
    },
    onMutate: async (vars) => {
      const key = ['loading', 'optimize', tourId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<OptimizeResponse>(key);
      if (prev) {
        const next: OptimizeResponse = {
          ...prev,
          loadingOrder: prev.loadingOrder.map((s) =>
            s.id === vars.shipmentId
              ? {
                  ...s,
                  isStackable: vars.stackable,
                  packageItems: s.packageItems?.map((p) => ({
                    ...p,
                    stackable: vars.stackable,
                  })),
                }
              : s,
          ),
        };
        queryClient.setQueryData(key, next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['loading', 'optimize', tourId], ctx.prev);
      }
      showToast('Stapelbarkeit speichern fehlgeschlagen', 'err');
    },
    onSuccess: () => {
      showToast('Stapelbarkeit aktualisiert');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['loading', 'optimize', tourId],
      });
    },
  });

  function handleResetPositions() {
    if (!window.confirm('Alle gespeicherten Positionen verwerfen und Auto-Placement neu berechnen?')) return;
    resetPositionsMutation.mutate();
  }

  // B-2.1 Insert-Mode Drop-Cascade-Handler.
  // Wenn user in insert-Mode auf besetzte Position dropt:
  //   - target = nächstes Paket nach posY-Center (findInsertTarget)
  //   - Reorder packages-Array: dragged VOR target
  //   - placePackages mit neuer Order → alle Positionen re-computed
  //   - PATCH alle geänderten Items + insertMode off + Toast
  const handleInsertAt = (
    draggedId: string,
    targetId: string | null,
    dropPosY: number,
  ) => {
    if (!draggedId) {
      insertMode.cancel();
      return;
    }
    // H5a: Insert-Anker bleibt paletteIndex===0 (= line_index-Row).
    // Vorher id-String-Heuristik ":pkg:" (filterte FV-Klone ":q*"
    // NICHT — latent buggy). Jetzt pkg-Lookup analog NvBody/FvBody.
    const draggedPkg = renderedPackages.find((p) => p.id === draggedId);
    if (!draggedPkg?.dbItemId || (draggedPkg.paletteIndex ?? 0) !== 0) {
      showToast('Klone (q>=1) sind keine Insert-Anker.', 'err');
      insertMode.cancel();
      return;
    }
    // Falls LP3D keinen target erkannt hat, selbst suchen.
    // BUG-F-PACK: nur renderedPackages — unplaced sitzen alle bei
    // (0,0,0) und wuerden findInsertTarget verfaelschen.
    const t =
      targetId ?? findInsertTarget(renderedPackages, dropPosY, draggedId);
    if (!t || t === draggedId) {
      // Kein sinnvolles Ziel → Cascade-No-op, normaler Drop-Pfad.
      handlePackagePosition(draggedId, 0, dropPosY, 0);
      insertMode.cancel();
      return;
    }
    // packages-Reihenfolge in Plan3DPackage[] reordern und re-placen.
    const reordered = computeInsertedOrder(
      renderedPackages.map((p) => ({ id: p.id })),
      draggedId,
      t,
    ).map((x) => renderedPackages.find((p) => p.id === x.id)!).filter(Boolean);
    const repacked = placePackages(
      reordered.map((p) => ({
        id: p.id,
        shipmentId: p.shipmentId,
        shipmentNumber: p.shipmentNumber,
        packageIndex: p.packageIndex,
        dbItemId: p.dbItemId,
        paletteIndex: p.paletteIndex,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        weightKg: p.weightKg,
        color: p.color,
        isStackable: p.isStackable,
        rotationDeg: p.rotationDeg,
        stopOrder: p.stopOrder,
        // storedPosX/Y/Z auf NULL setzen — sonst snapped placePackages
        // direkt zur gespeicherten Position und ignoriert die neue
        // Reihenfolge.
        storedPosX: undefined,
        storedPosY: undefined,
        storedPosZ: undefined,
      })),
      vehicleDims.lengthCm,
      vehicleDims.widthCm,
      vehicleDims.heightCm,
    );
    // PATCH alle DB-persisted Items.
    // BUG-F-PACK: unplaced NICHT persistieren (Phantom-Pos vermeiden).
    void (async () => {
      try {
        let written = 0;
        for (const pkg of repacked) {
          if (!pkg.dbItemId) continue;
          if (pkg.unplaced) continue;
          // H5a: Insert-Cascade bleibt Item-Level (paletteIndex===0).
          // Per-Palette-Cascade ist Backlog.
          if ((pkg.paletteIndex ?? 0) !== 0) continue;
          await api.patch(`/loading/package-item/${pkg.dbItemId}/position`, {
            paletteIndex: 0,
            posXCm: Math.round(pkg.posX),
            posYCm: Math.round(pkg.posY),
            posZCm: Math.round(pkg.posZ),
            rotationDeg: pkg.rotationDeg ?? 0,
          });
          written += 1;
        }
        await queryClient.invalidateQueries({
          queryKey: ['loading', 'optimize', tourId],
        });
        showToast(`Insert ✓ — ${written} Items neu positioniert.`);
      } catch (e) {
        showToast('Insert-Cascade fehlgeschlagen', 'err');
      }
      insertMode.cancel();
    })();
  };

  const handlePackagePosition = (
    id: string,
    posXCm: number,
    posYCm: number,
    posZCm: number,
    rotationDeg?: number,
  ) => {
    if (!id) return;
    // H5a: pkg-Lookup statt id-String-Heuristik (vorher
    // `id.includes(':pkg:')` — funktionierte fuer FV-Klone ":q*"
    // nicht und feuerte fuer q>=2 einen 404 PATCH /loading/package-
    // item/pi-X:q2/position). Jetzt: dbItemId + paletteIndex aus
    // pkg-Objekt (expandPackagesFromOrder setzt beides H5a).
    const pkg = renderedPackages.find((p) => p.id === id);
    if (!pkg?.dbItemId) return;
    persistItemPositionMutation.mutate({
      itemId: pkg.dbItemId,
      paletteIndex: pkg.paletteIndex,
      posXCm,
      posYCm,
      posZCm,
      rotationDeg,
    });
  };

  const clearDraftMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.delete(`/loading/tour/${tourId}/draft`);
      return data;
    },
    onSuccess: async () => {
      setManualPosById({});
      await queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] });
    },
  });
  const removeShipmentsMutation = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      if (!tourId) return null;
      for (const shipmentId of shipmentIds) {
        await api.post(`/tours/${tourId}/remove-shipment`, { shipmentId });
      }
      return { ok: true, count: shipmentIds.length };
    },
    onSuccess: async (res) => {
      setRemovedShipmentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['loading', 'optimize', tourId] }),
        queryClient.invalidateQueries({ queryKey: ['loading', 'tour-optimize-brief'] }),
        queryClient.invalidateQueries({ queryKey: ['tours'] }),
        queryClient.invalidateQueries({ queryKey: ['shipments'] }),
      ]);
      // P0-12 BUG-2: Explicit feedback (Right-Click-Path hatte vorher
      // keinen Toast — User dachte "nichts passiert" obwohl Remove
      // erfolgreich war).
      if (res?.count) {
        showToast(
          res.count === 1
            ? 'Sendung von Tour entfernt'
            : `${res.count} Sendungen von Tour entfernt`,
        );
      }
    },
    onError: (e: any) => {
      // eslint-disable-next-line no-console
      console.warn('removeShipments failed:', e);
      showToast(
        `Entfernen fehlgeschlagen (${e?.response?.status ?? '?'}).`,
        'err',
      );
    },
  });


  useEffect(() => {
    setManualPosById({});
    setRemovedShipmentIds([]);
  }, [tourId]);

  useEffect(() => {
    if (!optimizeQuery.isSuccess || !optimizeQuery.data?.recommendedVehicle) return;
    setSelectedVehicleType(matchVehicleType(optimizeQuery.data.recommendedVehicle.type));
  }, [tourId, optimizeQuery.isSuccess, optimizeQuery.data?.recommendedVehicle?.type]);


  useEffect(() => {
    const rows = optimizeQuery.data?.draftItems ?? [];
    if (!rows.length) return;
    setManualPosById((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        next[row.shipmentId] = {
          xPosCm: row.xPosCm,
          yPosCm: row.yPosCm,
          rotationAngle: row.rotationAngle ?? 0,
          stackLevel: Math.max(1, Math.min(6, row.stackLevel ?? 1)),
        };
      }
      return next;
    });
  }, [optimizeQuery.data?.draft?.updated_at, optimizeQuery.data?.draftItems, tourId]);





  const removeShipment = (shipmentId: string) => {
    setRemovedShipmentIds((prev) => (prev.includes(shipmentId) ? prev : [...prev, shipmentId]));
  };

  const undoRemoveShipment = (shipmentId: string) => {
    setRemovedShipmentIds((prev) => prev.filter((id) => id !== shipmentId));
  };




  return (
    <div className="w-full min-h-screen bg-white flex flex-col">
      {toast && (
        <div
          className={
            'fixed top-4 right-4 z-50 rounded-lg shadow-lg px-4 py-2 text-sm border ' +
            (toast.type === 'err'
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-emerald-50 border-emerald-300 text-emerald-800')
          }
        >
          {toast.msg}
        </div>
      )}
      <main className="w-full flex-1 px-4 sm:px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Beladeplan</h1>

        {optimizeQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
            Lade Laderaumoptimierung…
          </div>
        ) : optimizeQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
            <div className="font-medium">Beladeplan konnte nicht geladen werden.</div>
            <div className="text-red-700">{optimizeErrorText}</div>
            {(optimizeErrorText.includes('Cannot GET') ||
              (optimizeQuery.error as { response?: { status?: number } })?.response?.status ===
                404) && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
                <strong>Hinweis (404):</strong> Häufig läuft noch ein <strong>alter</strong> Backend-Prozess
                auf Port 3001 (ohne Loading-API). Bitte alle Node/Nest-Prozesse für dieses Backend beenden,
                im Ordner <code className="bg-amber-100 px-1 rounded">tms-backend</code> neu bauen (
                <code className="bg-amber-100 px-1 rounded">npm run build</code>) und{' '}
                <code className="bg-amber-100 px-1 rounded">npm run start:dev</code> erneut starten.
                API-Doku:{' '}
                <a className="underline text-[#1e40af]" href="http://localhost:3001/docs" target="_blank" rel="noreferrer">
                  http://localhost:3001/docs
                </a>{' '}
                – dort sollte <code className="bg-amber-100 px-1 rounded">GET /api/loading/tour/&#123;tourId&#125;/optimize</code>{' '}
                sichtbar sein.
              </div>
            )}
            <div className="text-xs text-red-600">
              Prüfen Sie außerdem, ob die Tour existiert. Touren ohne Sendungen sollten trotzdem eine leere
              Optimierung liefern.
            </div>
          </div>
        ) : !optimizeQuery.data ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Keine Daten verfügbar.
          </div>
        ) : (
          <div className="space-y-4">
            <InsertModeBanner
              active={insertMode.active}
              onCancel={insertMode.cancel}
            />
            <div className="space-y-2">
              <div className="flex items-center gap-4 bg-gray-100 p-2 rounded border border-gray-200 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700">Fahrzeug:</span>
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-xs bg-white"
                    value={selectedVehicleType}
                    onChange={(e) => setSelectedVehicleType(e.target.value)}
                  >
                    {VEHICLES.map((v) => (
                      <option key={v.type} value={v.type}>
                        {v.type}: {v.lengthCm}×{v.widthCm}×{v.heightCm}cm · max {(v.maxWeightKg ?? 0) / 1000}t ·{' '}
                        {v.maxLdm ?? 0} ldm
                      </option>
                    ))}
                  </select>
                  {matchVehicleType(optimizeQuery.data.recommendedVehicle.type) === selectedVehicleType ? (
                    <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300">
                      ⭐ Empfohlen
                    </span>
                  ) : null}
                </div>
                {/* O-2: Vol+Gewicht prominent (rot bei >100%), ldm Info. */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm items-center">
                  <span
                    className={
                      volUtil > 100 ? 'text-red-600 font-bold' : 'text-gray-800 font-semibold'
                    }
                    title="Volumen-Auslastung — massgeblicher Constraint."
                  >
                    Vol: {volUtil.toFixed(0)}%
                  </span>
                  <span
                    className={
                      weightUtil != null && weightUtil > 100
                        ? 'text-red-600 font-bold'
                        : 'text-gray-800 font-semibold'
                    }
                    title="Gewichts-Auslastung — massgeblicher Constraint."
                  >
                    Gew: {weightUtil?.toFixed(0) ?? '—'}%
                  </span>
                  <span className="text-gray-400">·</span>
                  <span
                    className="text-gray-500 text-xs"
                    title="Boden-Lademeter — Info."
                  >
                    Boden-ldm: {Math.min(100, ldmMetrics.floorPct).toFixed(0)}%
                  </span>
                  <span
                    className="text-gray-500 text-xs"
                    title="Effektive Lademeter (stapelbar zählt mit ½) — Info."
                  >
                    Effektiv: {ldmMetrics.effectivePct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {/* O-2: Lademeter-Info — Bars verlieren rot-Trigger. */}
                <div className="text-gray-800 leading-relaxed bg-blue-50 p-3 rounded border border-blue-200 space-y-2">
                  <div className="font-medium text-gray-900">Lademeter (Info)</div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                    <div>
                      <span className="text-gray-600">Boden (ohne Stapelvorteil):</span>{' '}
                      <strong>
                        {ldmMetrics.floorUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                      </strong>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#1e40af]"
                          style={{ width: `${Math.min(100, ldmMetrics.floorPct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500">Balken max. 100 % (reiner Bodenbedarf)</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Effektiv (stapelbar ÷2):</span>{' '}
                      <strong>
                        {ldmMetrics.effectiveUsed.toFixed(2)} / {ldmMetrics.maxLdm.toFixed(1)} ldm
                      </strong>
                      <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${Math.min(100, ldmMetrics.effectivePct)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500">
                        Zusätzlich frei durch Stapeln:{' '}
                        <strong>{ldmMetrics.freeEffectiveLdm.toFixed(2)} ldm</strong> (vs. Boden{' '}
                        {ldmMetrics.freeFloorLdm.toFixed(2)} ldm)
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    Stapel-Potenzial: <strong>{ldmMetrics.headroomLdm.toFixed(2)} ldm</strong> — Summe der Hälfte aller
                    stapelbaren Sendungen (Faktor 2 auf den Boden-Lademeter). Packstücke werden in der Route-Reihenfolge
                    automatisch gestapelt, wenn Höhe und Stapelbarkeit passen.
                  </div>
                </div>
                <div className="text-gray-700 bg-slate-50 p-2 rounded border border-slate-200 text-xs sm:text-sm">
                  📐 {cargoVolM3.toFixed(1)} m³ / {trailerVolM3.toFixed(1)} m³ ({volUtil.toFixed(0)}% Volumen) · ⚖{' '}
                  {totalWeightActive.toLocaleString('de-DE')} kg / {maxWeightDisplay.toLocaleString('de-DE')} kg (
                  {weightUtil?.toFixed(0) ?? '—'}% Gewicht)
                </div>
              </div>
              {isOverloaded ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 space-y-1">
                  <div className="font-medium">⚠ Überladung für gewähltes Fahrzeug</div>
                  {volUtil > 100 ? (
                    <div>
                      Volumen: {cargoVolM3.toFixed(1)} / {trailerVolM3.toFixed(1)} m³
                    </div>
                  ) : null}
                  {weightUtil != null && weightUtil > 100 ? (
                    <div>
                      Gewicht: {totalWeightActive.toLocaleString('de-DE')} /{' '}
                      {maxWeightDisplay.toLocaleString('de-DE')} kg
                    </div>
                  ) : null}
                </div>
              ) : null}
              {/* Dispo-Sicherheit Banner — N Sendung(en) nicht plazierbar.
                  Einheitliche Wording-Konvention (Vollansicht + Dock-Panel).
                  Zaehlung: distinct shipmentId, NICHT Packstuecke. */}
              {unplacedShipmentCount > 0 ? (
                <div
                  role="alert"
                  className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-2"
                >
                  <div className="font-medium">
                    ⚠ {unplacedShipmentCount} Sendung(en) passen nicht auf den Trailer
                  </div>
                  <div className="text-xs">
                    Größeres Fahrzeug wählen oder Tour verkleinern. Nicht
                    plazierbare Pakete werden im 3D-Layout ausgeblendet.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">3D Laderaum</div>
                </div>

                {(() => {
                  // Per-shipment Farb-Mapping (3D-spezifisch, SVG bleibt Stop-Farbe)
                  const SHIPMENT_COLORS = [
                    '#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#9333ea',
                    '#0891b2', '#ea580c', '#db2777', '#0f766e', '#7c3aed',
                  ];
                  const shipIdx = new Map<string, number>();
                  for (const p of renderedPackages) {
                    if (!shipIdx.has(p.shipmentId)) shipIdx.set(p.shipmentId, shipIdx.size);
                  }
                  return (
                    <>
                      <div className="flex justify-end gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Tour optimal beladen? Alle Positionen werden ersetzt (Carlos-Stack-Rule: non-stackable→Boden, schwer-unten, groß-zuerst).',
                              )
                            ) {
                              repackOptimalMutation.mutate();
                            }
                          }}
                          disabled={
                            repackOptimalMutation.isPending ||
                            renderedPackages.length === 0
                          }
                          className="text-xs rounded border border-blue-300 bg-blue-50 px-3 py-1 hover:bg-blue-100 disabled:opacity-50 text-blue-700 font-medium"
                          title="Optimaler Stapel-Algorithmus (FFDH mit Carlos-Stack-Rule)"
                        >
                          {repackOptimalMutation.isPending
                            ? 'Berechne…'
                            : '🔄 Neu optimal beladen'}
                        </button>
                        <button
                          type="button"
                          onClick={handleResetPositions}
                          disabled={resetPositionsMutation.isPending}
                          className="text-xs rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
                          title="Auto-Placement neu berechnen (alle gespeicherten Positionen löschen)"
                        >
                          {resetPositionsMutation.isPending
                            ? 'Setze zurück…'
                            : '↺ Auto-Placement neu berechnen'}
                        </button>
                      </div>
                      {/* LoadingPlan3D fuellt jetzt h-full (Eltern bestimmt
                          Hoehe). Vollansicht-Default = 480px-Wrapper damit
                          das bisherige Layout unveraendert bleibt. */}
                      <div className="h-[480px]">
                        <LoadingPlan3D
                          vehicle={{
                            lengthCm: vehicleDims.lengthCm,
                            widthCm: vehicleDims.widthCm,
                            heightCm: vehicleDims.heightCm,
                          }}
                          vehicleType={selectedVehicle?.type ?? selectedVehicleType}
                          onPositionChange={handlePackagePosition}
                          insertMode={insertMode.active}
                          onInsertAt={handleInsertAt}
                          onPackageContextMenu={(pkgId, x, y) => {
                            const pkg = renderedPackages.find((p) => p.id === pkgId);
                            if (!pkg) return;
                            setCtxMenu({
                              shipmentId: pkg.shipmentId,
                              x,
                              y,
                            });
                          }}
                          packages={renderedPackages.map((p) => ({
                            id: p.id,
                            lengthCm: p.lengthCm,
                            widthCm: p.widthCm,
                            heightCm: p.heightCm,
                            posX: p.posX,
                            posY: p.posY,
                            posZ: p.posZ,
                            weightKg: p.weightKg,
                            color:
                              SHIPMENT_COLORS[
                                (shipIdx.get(p.shipmentId) ?? 0) % SHIPMENT_COLORS.length
                              ],
                            isStackable: p.isStackable,
                            rotationDeg: p.rotationDeg,
                          }))}
                        />
                      </div>
                      <AxleLoadPanel
                        packages={renderedPackages.map((p) => ({
                          posY: p.posY,
                          weightKg: p.weightKg,
                        }))}
                        vehicleType={selectedVehicle?.type ?? selectedVehicleType}
                        trailerLength_m={vehicleDims.lengthCm / 100}
                        groundedCount={renderedPackages.filter((p) => p.posZ < 1e-6).length}
                        totalCount={renderedPackages.length}
                      />
                    </>
                  );
                })()}

              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900">Tour-Reihenfolge</div>
                  <button
                    type="button"
                    onClick={() => setManualOrder(null)}
                    className="text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                  >
                    Optimale Reihenfolge
                  </button>
                </div>
                <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 mb-3">
                  {activeOrder.map((s, index) => (
                    <div
                      key={s.id}
                      className="rounded border border-gray-200 px-2 py-1.5 bg-white flex items-center gap-2 text-xs"
                      draggable
                      onDragStart={() => setDraggingId(s.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (!draggingId || draggingId === s.id) return;
                        const visibleIds = activeOrder.map((x) => x.id);
                        const from = visibleIds.indexOf(draggingId);
                        const to = visibleIds.indexOf(s.id);
                        if (from < 0 || to < 0) return;
                        const nextVisible = [...visibleIds];
                        nextVisible.splice(from, 1);
                        nextVisible.splice(to, 0, draggingId);
                        const tail = effectiveOrder.map((x) => x.id).filter((id) => !nextVisible.includes(id));
                        setManualOrder([...nextVisible, ...tail]);
                        setDraggingId(null);
                      }}
                    >
                      <span className="text-gray-400 w-4 shrink-0">{index + 1}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0 border border-gray-600"
                        style={{
                          backgroundColor:
                            STOP_COLORS[
                              (Math.max(1, s.deliveryOrder ?? index + 1) - 1) % STOP_COLORS.length
                            ],
                        }}
                      />
                      <span className="font-medium text-gray-900 truncate">{s.shipmentNumber}</span>
                      <span className="text-gray-500 truncate">{s.deliveryCity}</span>
                    </div>
                  ))}
                </div>

                <div className="font-medium text-gray-900 mb-2">Packstücke</div>
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 text-xs font-mono leading-relaxed">
                  {activeOrder.map((s) => {
                    const pkgs = packagesFlat.filter((x) => x.shipmentId === s.id);
                    const swatch =
                      STOP_COLORS[(Math.max(1, s.deliveryOrder ?? 1) - 1) % STOP_COLORS.length];
                    if (pkgs.length === 0) return null;
                    return (
                      <div key={s.id}>
                        <div className="flex items-center justify-between gap-2 font-sans font-semibold text-gray-900 text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-3 h-3 rounded border border-gray-700 shrink-0"
                              style={{ backgroundColor: swatch }}
                            />
                            {s.shipmentNumber} · {pkgs.length} Pakete · {(Number(s.ldm) || 0).toFixed(2)} ldm
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setShipmentStackableMutation.mutate({
                                  shipmentId: s.id,
                                  stackable: !s.isStackable,
                                })
                              }
                              disabled={setShipmentStackableMutation.isPending}
                              className={`text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-50 ${
                                s.isStackable
                                  ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                                  : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                              }`}
                              title={
                                s.isStackable
                                  ? 'Stapelbar (Klick: nicht-stapelbar)'
                                  : 'Nicht stapelbar (Klick: stapelbar)'
                              }
                            >
                              {s.isStackable ? '⇈ stapelbar' : '⊘ nicht'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeShipment(s.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Sendung von Tour entfernen"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <ul className="mt-1 pl-2 border-l border-gray-200 ml-1.5 space-y-0.5">
                          {pkgs.map((pkg, i) => (
                            <li key={pkg.id}>
                              {i === pkgs.length - 1 ? '└── ' : '├── '}
                              Paket {pkg.packageIndex}: {Math.round(pkg.lengthCm)}×{Math.round(pkg.widthCm)}×
                              {Math.round(pkg.heightCm)} cm · {pkg.weightKg.toLocaleString('de-DE')} kg ·{' '}
                              {pkg.isStackable ? 'Stapelbar ✓' : 'Nicht stapelbar ✗'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                {removedShipmentIds.length > 0 ? (
                  <div className="mt-3 p-2 rounded border border-amber-200 bg-amber-50 text-xs">
                    <div className="font-medium text-amber-900 mb-1">Entfernt:</div>
                    <div className="flex flex-wrap gap-2">
                      {removedShipmentIds.map((id) => {
                        const s = effectiveOrder.find((x) => x.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => undoRemoveShipment(id)}
                            className="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100"
                          >
                            {s?.shipmentNumber ?? id} [Zurück]
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                  <div className="text-xs font-medium text-gray-700">
                    Feinplatzierung je Sendung (Δ Länge / Δ Breite cm,{' '}
                    <span title="Zusätzliche Schicht: eine Pakethöhe pro Stufe (niedrigstes Packstück)">Stapel</span>
                    , Drehung)
                  </div>
                  <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
                    {activeOrder.map((s) => {
                      const cur = manualPosById[s.id] ?? {
                        xPosCm: 0,
                        yPosCm: 0,
                        rotationAngle: 0,
                        stackLevel: 1,
                      };
                      return (
                        <div
                          key={s.id}
                          className="grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_2.5rem_3.25rem] gap-1 items-center text-xs"
                        >
                          <div className="truncate font-sans" title={s.shipmentNumber}>
                            {s.shipmentNumber}
                          </div>
                          <input
                            type="number"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.xPosCm}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  xPosCm: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.yPosCm}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  yPosCm: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            max={6}
                            title="Stapel"
                            className="w-full min-w-0 rounded border border-gray-300 px-1 py-0.5"
                            value={cur.stackLevel}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  stackLevel: Math.min(
                                    6,
                                    Math.max(1, Math.round(Number(e.target.value) || 1)),
                                  ),
                                },
                              }))
                            }
                          />
                          <select
                            className="w-full min-w-0 rounded border border-gray-300 px-0.5 py-0.5 text-[11px]"
                            value={cur.rotationAngle}
                            onChange={(e) =>
                              setManualPosById((prev) => ({
                                ...prev,
                                [s.id]: {
                                  ...cur,
                                  rotationAngle: Number(e.target.value) || 0,
                                },
                              }))
                            }
                          >
                            <option value={0}>0°</option>
                            <option value={90}>90°</option>
                            <option value={180}>180°</option>
                            <option value={270}>270°</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        saveDraftMutation.mutate({
                          items: activeOrder.map((row) => {
                            const cur = manualPosById[row.id] ?? {
                              xPosCm: 0,
                              yPosCm: 0,
                              rotationAngle: 0,
                              stackLevel: 1,
                            };
                            return {
                              shipmentId: row.id,
                              xPosCm: cur.xPosCm,
                              yPosCm: cur.yPosCm,
                              rotationAngle: cur.rotationAngle,
                              stackLevel: cur.stackLevel,
                            };
                          }),
                        })
                      }
                      disabled={saveDraftMutation.isPending}
                      className="px-2 py-1 rounded border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-60"
                    >
                      Feinplatzierung speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => clearDraftMutation.mutate()}
                      disabled={clearDraftMutation.isPending}
                      className="px-2 py-1 rounded border border-gray-300 bg-white text-xs hover:bg-gray-50 disabled:opacity-60"
                    >
                      Draft zurücksetzen
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {optimizeQuery.data.warnings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <div className="font-medium text-red-700 mb-2">⚠ Warnungen</div>
                {optimizeQuery.data.warnings.map((w, idx) => (
                  <div key={idx} className="text-red-600 text-sm">
                    • {w}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => window.open(`/api/loading/tour/${tourId}/loading-plan-pdf`, '_blank')}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Beladeplan drucken
              </button>
              <button
                type="button"
                disabled={applyOrderMutation.isPending}
                onClick={() => applyOrderMutation.mutate(activeOrder.map((s) => s.id))}
                className="px-3 py-2 rounded-lg bg-[#1e40af] text-white hover:bg-[#1e3a8a] text-sm disabled:opacity-60"
              >
                Reihenfolge in Tour speichern
              </button>
              <button
                type="button"
                disabled={removedShipmentIds.length === 0 || removeShipmentsMutation.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    `${removedShipmentIds.length} Sendung(en) werden von Tour entfernt. Fortfahren?`,
                  );
                  if (!ok) return;
                  removeShipmentsMutation.mutate(removedShipmentIds);
                }}
                className="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm disabled:opacity-60"
              >
                Änderungen speichern
              </button>
              <button
                type="button"
                disabled={removedShipmentIds.length === 0}
                onClick={() => setRemovedShipmentIds([])}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm disabled:opacity-60"
              >
                Alles zurücksetzen
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm"
              >
                Schließen
              </button>
            </div>
          </div>
        )}
      </main>
      {ctxMenu && (() => {
        const ship = activeOrder.find((s) => s.id === ctxMenu.shipmentId);
        const isStackable = ship?.isStackable ?? true;
        const items: ContextMenuItem[] = [
          {
            label: isStackable ? 'Nicht stapelbar setzen' : 'Stapelbar setzen',
            onClick: () =>
              setShipmentStackableMutation.mutate({
                shipmentId: ctxMenu.shipmentId,
                stackable: !isStackable,
              }),
            separator: true,
          },
          {
            label: 'Sendung aus Tour entfernen',
            danger: true,
            icon: <Trash2 size={12} />,
            onClick: () => {
              if (
                window.confirm(
                  `Sendung ${ship?.shipmentNumber ?? ''} von Tour entfernen?`,
                )
              ) {
                removeShipmentsMutation.mutate([ctxMenu.shipmentId]);
              }
            },
          },
        ];
        return (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={items}
            onClose={() => setCtxMenu(null)}
          />
        );
      })()}
    </div>
  );
}
