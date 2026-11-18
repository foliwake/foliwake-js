// Canned answers of a Foliwake server for the CLI's tests, shaped as @foliwake/core-contract declares them.
export const SR = `sr_${'a'.repeat(32)}`;
export const SR_OLD = `sr_${'e'.repeat(32)}`;
export const CD = `cd_${'b'.repeat(32)}`;
export const AT = '2026-11-18T01:02:03.000Z';

export const sitesList = {
  sites: [
    {
      id: 'my-site',
      org: 'acme-org',
      liveHosts: ['www.example.com'],
      previewBaseHost: 'preview.example.com',
      liveUrl: 'https://www.example.com/',
      previewUrl: 'https://my-site.preview.example.com/',
      branchUrls: 'https://{branch}--my-site.preview.example.com/',
      addresses: 'managed',
      repository: 'https://github.com/example/my-site',
      binding: 'bound',
    },
  ],
};

export const siteStatus = {
  site: 'my-site',
  org: 'acme-org',
  live: {
    generation: 7,
    site_release: SR,
    content_release: `cr_${'c'.repeat(32)}`,
    code_release: CD,
    operation: 'op_1',
    committed_at: AT,
    source_revision: null,
    source_repository: null,
    parent: SR_OLD,
    operation_kind: 'publish',
  },
  preview: null,
  previewVersion: null,
  operations: [],
  pendingInvalidations: 0,
  pendingByCache: [],
  cache: { configured: false, target: null },
  codeRollout: {
    pending: null,
    lastAttempt: null,
    rollbackTo: null,
    liveIsRollback: false,
    mode: 'manual',
    lastDeploy: null,
  },
};

/** A finished operation of `kind`, with its stored result. */
export function operation(kind, result, state = 'succeeded') {
  return {
    id: 'op_1',
    kind,
    org: 'acme-org',
    site: 'my-site',
    state,
    cancellable: false,
    cancelRequested: false,
    delivery: { state: 'done' },
    result,
    startedAt: AT,
    finishedAt: AT,
  };
}

/** The stored result of a publication-like operation. */
export const releaseResult = {
  operationId: 'op_1',
  state: 'done',
  code: null,
  message: null,
  siteRelease: SR,
  generation: 8,
  codeRelease: CD,
  sourceRevision: null,
  previousSiteRelease: SR_OLD,
  diagnostics: [],
  warnings: [],
  delivery: { state: 'done', reason: null },
};

export const credentialsList = {
  writable: true,
  credentials: [
    {
      name: 'DRIVE_KEY',
      set: true,
      source: 'file',
      updatedAt: AT,
      by: 'account:acc_owner',
      usedBy: [{ site: 'my-site', source: 'docs', field: 'serviceAccountKey' }],
      serviceAccount: null,
    },
  ],
};

export const keysList = [
  { id: 'key_1', name: 'laptop', client: '@foliwake/cli/0.6.0', createdAt: 1, lastUsedAt: 2, expiresAt: 3 },
];

export const branchesList = [
  {
    branch: 'main',
    label: 'main--0123abcd',
    isDefault: true,
    generation: 2,
    selection: `sel_${'d'.repeat(32)}`,
    codeRelease: CD,
    sourceRevision: null,
    committedAt: AT,
    operation: 'op_2',
    retired: null,
    host: null,
    sequence: 4,
    previewUrl: 'https://main--0123abcd.preview.example.com/',
    readableUrl: null,
    siteBranchUrl: null,
  },
];

/** The stored result of `sites.create` for site `my-site`. */
export const siteCreateResult = {
  site: 'my-site',
  org: 'acme-org',
  addresses: {
    live: 'https://my-site.example.com/',
    preview: 'https://my-site.preview.example.com/',
    branchPattern: null,
  },
  releaseOne: { state: 'done', siteRelease: SR, codeRelease: CD, commit: 'f'.repeat(40) },
  bucketCreated: true,
};
