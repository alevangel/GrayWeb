import { api } from '../shared/platform/api';

/** Time that one sample can take before GrayWeb shows a warning (M-16). */
export const SAMPLE_TIMEOUT_MS = 50;

// Text that makes badly written expressions very slow (catastrophic backtracking).
const STRESS_SAMPLES = [
  `https://${'a'.repeat(28)}!`,
  `https://${'www.'.repeat(16)}example.com/${'a/'.repeat(16)}!`,
  `https://example.com/${'1'.repeat(28)}x`,
  `https://example.com/?q=${'-'.repeat(28)}#`,
];

export type RegexSpeed = 'ok' | 'slow';

/** Tests a regular expression in a worker. Returns "slow" when a sample takes too long. */
export function checkRegexSpeed(
  pattern: string,
  ignoreCase: boolean,
  urls: string[] = [],
): Promise<RegexSpeed> {
  const samples = [...urls, ...STRESS_SAMPLES];
  return new Promise((resolve) => {
    const worker = new Worker(api.runtime.getURL('regex-worker.js'));
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: RegexSpeed): void => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const arm = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => finish('slow'), SAMPLE_TIMEOUT_MS);
    };

    worker.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
      if (event.data.type === 'ready') {
        arm();
        worker.postMessage({ pattern, flags: ignoreCase ? 'i' : '', samples });
      } else if (event.data.type === 'progress') {
        arm();
      } else {
        finish('ok');
      }
    });
    worker.addEventListener('error', () => finish('ok'));
  });
}
