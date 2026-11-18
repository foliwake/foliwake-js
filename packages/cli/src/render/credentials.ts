import type { CredentialList, CredentialRemoveResult, CredentialSetResult } from '../core-types.js';

type Entry = CredentialList['credentials'][number];

function stateOf(entry: Entry): string {
  if (!entry.set) return 'not set';
  const when = entry.updatedAt ? ` · updated ${entry.updatedAt}` : '';
  return `set (${entry.source})${when}`;
}

function usesOf(entry: Entry): string {
  if (entry.usedBy.length === 0) return 'not used by a source';
  return `used by ${entry.usedBy.map((use) => `${use.site}/${use.source}`).join(', ')}`;
}

/** The lines `foliwake credential list` prints. Values are never part of the answer. */
export function credentialListLines(list: CredentialList): string[] {
  if (list.credentials.length === 0) return ['No credentials are stored or used by a content source.'];
  const lines: string[] = [];
  for (const entry of list.credentials) {
    lines.push(`${entry.name}: ${stateOf(entry)} · ${usesOf(entry)}`);
    if (entry.serviceAccount) lines.push(`  service account ${entry.serviceAccount.clientEmail}`);
  }
  if (!list.writable) lines.push('', 'This server has no credentials folder: values come from its environment only.');
  return lines;
}

export function credentialSetLines(result: CredentialSetResult): string[] {
  const lines = [`Stored ${result.name} (${result.updatedAt}). The next sync or check uses it; no restart is needed.`];
  if (result.serviceAccount) lines.push(`Share the Drive folder with ${result.serviceAccount.clientEmail} (Viewer).`);
  if (result.shadowedByEnv)
    lines.push(`The server environment also sets ${result.name}; that value wins until it is removed there.`);
  return lines;
}

export function credentialRemoveLines(result: CredentialRemoveResult): string[] {
  const done = result.removed
    ? `Removed the stored value of ${result.name}.`
    : `No value of ${result.name} was stored.`;
  return result.stillSetByEnv ? [done, `The server environment still sets ${result.name}.`] : [done];
}
