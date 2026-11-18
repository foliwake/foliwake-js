// `site status` for people.
import { COMMAND } from '../settings.js';

import type { SiteStatus } from '../core-types.js';
import { describeInputs } from '../lib/summaries.js';

const C = COMMAND;
const FINISHED_STATES = ['done', 'noop', 'conflict', 'superseded', 'failed'];

function committedAt(iso: string): string {
  return `${iso.replace('T', ' ').slice(0, 16)} UTC`;
}

function channelLine(channel: { generation: number; committed_at: string }): string {
  return `release ${channel.generation} · ${committedAt(channel.committed_at)}`;
}

function versionLines(version: NonNullable<SiteStatus['previewVersion']>): string[] {
  const built = version.inputs
    ? ` · built from ${describeInputs(version.inputs)}`
    : ' · source snapshots not recorded here';
  const lines = [
    `Version    ${version.site_release}${built} · code ${version.code_release} (publish it with --expect ` +
      `${version.site_release})`,
  ];
  if (version.prepared_for_code) {
    lines.push(
      `           prepared for code ${version.prepared_for_code} (preview --code): this preview cannot be published ` +
        `(PUBLISH_PREVIEW_CHANGED); make that code live, run \`${C} preview\` again and review it.`,
    );
  }
  if (
    version.preview_update === 'migration' &&
    version.live_code_release &&
    version.live_code_release !== version.code_release
  ) {
    lines.push(
      `           new code ${version.code_release} waits here for its release (\`${C} migration commit --expect ` +
        `${version.site_release}@${version.code_release}\`); pages published meanwhile go live on the current live ` +
        `code ${version.live_code_release}.`,
    );
  } else if (version.live_code_release && version.live_code_release !== version.code_release) {
    lines.push(
      `           live code is now ${version.live_code_release}: this preview cannot be published ` +
        `(PUBLISH_CODE_CHANGED); run \`${C} preview\` again and review it.`,
    );
  }
  return lines;
}

function pendingLine(status: SiteStatus): string {
  const pending: string[] = [];
  const open = status.operations.filter((operation) => !FINISHED_STATES.includes(operation.state));
  if (status.pendingInvalidations)
    pending.push(
      `${status.pendingInvalidations} cache refresh(es)` +
        (status.cache.configured ? '' : ' recorded for a cache that is not configured now (kept until it is)'),
    );
  if (open.length) pending.push(`${open.length} unfinished operation(s)`);
  return `Pending    ${pending.length ? `${pending.join(', ')} — run \`${C} operation recover --wait\`` : 'nothing'}`;
}

function lastOperationLines(status: SiteStatus): string[] {
  const last = status.operations.at(-1);
  if (last == null) return [];
  const pages = last.pages.length ? ` ${last.pages.join(', ')}` : '';
  return [`Last       ${last.kind}${pages} → ${last.state}${last.message ? ` (${last.message})` : ''}`];
}

function codeReleaseLines(status: SiteStatus): string[] {
  const { mode, lastDeploy } = status.codeRollout;
  const lines = [
    `Code       new frontend code is released ` +
      (mode === 'auto'
        ? 'automatically when its checks pass (codeRelease: auto)'
        : 'by hand after review (codeRelease: manual)'),
  ];
  if (lastDeploy)
    lines.push(
      `           last deploy ${lastDeploy.revision.slice(0, 12)} → ${lastDeploy.result} · ` +
        `${committedAt(lastDeploy.at)}${lastDeploy.reason ? ` (${lastDeploy.reason})` : ''}`,
    );
  return lines;
}

export function siteStatusLines(status: SiteStatus): string[] {
  return [
    `Site       ${status.site}`,
    `Live       ${status.live ? channelLine(status.live) : `none (\`${C} code prepare\` makes release 1)`}`,
    `Preview    ${status.preview ? channelLine(status.preview) : 'none'}`,
    ...(status.previewVersion ? versionLines(status.previewVersion) : []),
    ...codeReleaseLines(status),
    `Cache      ` +
      `${status.cache.configured ? status.cache.target : 'none configured (publications need no cache refresh)'}`,
    pendingLine(status),
    ...status.pendingByCache.map(
      (owed) =>
        `           ${owed.target ?? 'a cache'}: ${owed.pending} refresh(es), ${owed.attempts} ` +
        `attempt(s)${owed.lastError ? `, last error: ${owed.lastError}` : ''}`,
    ),
    ...lastOperationLines(status),
  ];
}
