let lastCapturedError: unknown = undefined;

export function captureError(error: unknown) {
  lastCapturedError = error;
}

export function consumeLastCapturedError() {
  const error = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

if (typeof globalThis !== "undefined") {
  globalThis.addEventListener?.("error", (event) => captureError(event.error ?? event.message));
  globalThis.addEventListener?.("unhandledrejection", (event) => captureError(event.reason));
}
