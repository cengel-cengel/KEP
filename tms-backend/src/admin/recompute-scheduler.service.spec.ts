/**
 * R3+ RecomputeSchedulerService Tests.
 *
 * Verifiziert:
 *   - nightlyRecompute ruft RecomputeService.runRecomputeLoop('all', 10)
 *   - isRunning-Guard: zweiter parallel-call wird übersprungen
 *   - Fehler werden gefangen, kein Throw aus dem Decorator-Handler
 *
 * Wir rufen die Methode DIREKT (nicht via @Cron), weil wir den
 * Decorator-Trigger nicht echt scheduled testen wollen — die Logik
 * im Body ist das, was wichtig ist.
 */
import { RecomputeSchedulerService } from './recompute-scheduler.service';

function makeRecompute(opts: { fail?: boolean } = {}) {
  return {
    runRecomputeLoop: jest.fn().mockImplementation(() => {
      if (opts.fail) return Promise.reject(new Error('loop-failed'));
      return Promise.resolve({
        mode: 'all',
        count_nv: 2,
        count_fv: 3,
        processed_nv: 2,
        processed_fv: 3,
        errors_nv: 0,
        errors_fv: 0,
        duration_ms: 42,
      });
    }),
  } as any;
}

describe('RecomputeSchedulerService.nightlyRecompute', () => {
  it('ruft runRecomputeLoop("all", 10)', async () => {
    const recompute = makeRecompute();
    const svc = new RecomputeSchedulerService(recompute);
    await svc.nightlyRecompute();
    expect(recompute.runRecomputeLoop).toHaveBeenCalledWith('all', 10);
  });

  it('isRunning-Guard: 2. parallel-call wird übersprungen', async () => {
    const recompute = makeRecompute();
    // Pending-Promise für 1. Call halten.
    let resolve1!: (v: unknown) => void;
    (recompute.runRecomputeLoop as jest.Mock).mockImplementationOnce(
      () => new Promise((res) => (resolve1 = res)),
    );

    const svc = new RecomputeSchedulerService(recompute);
    const p1 = svc.nightlyRecompute();
    // 2. Call während 1. noch hängt — sollte SOFORT zurückkommen.
    const p2 = svc.nightlyRecompute();
    await p2;

    expect(recompute.runRecomputeLoop).toHaveBeenCalledTimes(1);

    // 1. Call auflösen → cleanup.
    resolve1({
      mode: 'all',
      count_nv: 0,
      count_fv: 0,
      processed_nv: 0,
      processed_fv: 0,
      errors_nv: 0,
      errors_fv: 0,
      duration_ms: 1,
    });
    await p1;
    expect(svc._isRunning).toBe(false);
  });

  it('Fehler im Loop → kein Re-Throw, isRunning released', async () => {
    const recompute = makeRecompute({ fail: true });
    const svc = new RecomputeSchedulerService(recompute);
    await expect(svc.nightlyRecompute()).resolves.toBeUndefined();
    expect(svc._isRunning).toBe(false);
  });

  it('nach erfolgreichem Run ist isRunning released', async () => {
    const recompute = makeRecompute();
    const svc = new RecomputeSchedulerService(recompute);
    await svc.nightlyRecompute();
    expect(svc._isRunning).toBe(false);
  });
});
