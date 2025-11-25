import { beforeAll, vi } from 'vitest';
import * as throttleModule from '@aws-accelerator/utils/lib/throttle';

process.setMaxListeners(50);

beforeAll(() => {
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(throttleModule, 'throttlingBackOff').mockImplementation(async (wrappedFunction: () => any) => {
    return wrappedFunction();
  });
});
