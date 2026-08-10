/**
 * Shared vitest setup for all projects.
 *
 * Vitest projects do NOT inherit the root config's setupFiles: each project
 * config replaces the root test options. Reference this file explicitly from
 * every project vitest.config.ts, e.g.:
 *
 *   setupFiles: ['../../../vitest.shared-setup.ts']
 *
 * It neutralizes real time delays in unit tests:
 * - setTimeout fires immediately (no real sleeps)
 * - throttlingBackOff runs the wrapped function once without backoff delays
 *
 * The spies are installed in beforeEach (not beforeAll) so they survive files
 * that call vi.restoreAllMocks() in afterEach: beforeAll runs once per file, so
 * the first restore would revert these spies and reintroduce the real sleeps for
 * every remaining test in that file.
 */
import { beforeEach, vi } from 'vitest';
import * as throttleModule from '@aws-accelerator/utils/lib/throttle';

process.setMaxListeners(50);

beforeEach(() => {
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(throttleModule, 'throttlingBackOff').mockImplementation(async (wrappedFunction: () => any) => {
    return wrappedFunction();
  });
});
