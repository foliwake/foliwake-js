import type { PluginList } from '../core-types.js';

/** The lines `foliwake source plugins` prints. */
export function pluginListLines({
  registryFile,
  apiVersion,
  plugins,
  unavailable,
  disabled,
  planned,
  problems,
}: PluginList): string[] {
  const lines = [
    `Content-source plugins (API ${apiVersion}; ` +
      `${registryFile ? 'from the registry file' : 'no registry file, bundled plugins only'})`,
  ];
  for (const p of plugins)
    lines.push(
      `  ${p.id.padEnd(16)}${p.displayName} · ` +
        `${p.bundled ? 'bundled' : `${p.package}@${p.packageVersion}${p.origin === 'shipped' ? ' (shipped)' : ''}`} ` +
        `· API ${p.apiVersion} · normalization ${p.normalizationVersion}`,
    );
  if (unavailable.length) {
    lines.push('\nUnavailable (cannot be configured until fixed):');
    for (const p of unavailable)
      lines.push(`  ${p.id.padEnd(16)}${p.displayName}${p.origin === 'shipped' ? ' (shipped)' : ''} · ${p.reason}`);
  }
  if (disabled.length) {
    lines.push('\nDisabled by configuration (shipped with the engine, not selected by the registry):');
    for (const p of disabled)
      lines.push(`  ${p.id.padEnd(16)}${p.displayName} · to enable, add {"shipped": "${p.id}"}`);
  }
  lines.push('\nPlanned (not installed; cannot be configured):');
  for (const p of planned) lines.push(`  ${p.id.padEnd(16)}${p.displayName}`);
  if (problems.length) {
    lines.push('\nProblems (these plugins are unavailable; nothing else is affected; --debug says why):');
    for (const p of problems) lines.push(`  ${p.code}: ${p.message}`);
  }
  return lines;
}
