// Development-only diagnostics: true when the bundler or runtime says NODE_ENV is 'development'.
export function isDevelopment(): boolean {
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV === 'development';
  } catch {
    return false;
  }
}
