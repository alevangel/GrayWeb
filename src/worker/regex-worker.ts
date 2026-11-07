// Runs a regular expression against sample URLs in a separate thread.
// The page stops this worker when a test takes too long (M-16).

interface Job {
  pattern: string;
  flags: string;
  samples: string[];
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<Job>) => {
  const { pattern, flags, samples } = event.data;
  const regex = new RegExp(pattern, flags);
  samples.forEach((sample, index) => {
    regex.test(sample);
    scope.postMessage({ type: 'progress', index });
  });
  scope.postMessage({ type: 'done' });
});

scope.postMessage({ type: 'ready' });
