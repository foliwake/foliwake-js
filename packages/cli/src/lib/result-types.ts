// The results long operations store (`operation.result`), as the engine's schemas declare them. The contract
// types `result` as unknown (each kind has its own), so the CLI declares the kinds it renders here.

export type OperationResult = {
  operationId: string;
  state: string;
  code: string | null;
  message: string | null;
  siteRelease: string | null;
  generation: number | null;
  codeRelease: string | null;
  sourceRevision: string | null;
  previousSiteRelease: string | null;
  diagnostics: Array<{
    code: string;
    severity: 'error' | 'warning';
    file: string;
    line: number;
    column: number;
    message: string;
    fix: string | null;
  }>;
  warnings: string[];
  delivery: {
    state: 'done' | 'pending' | 'not_required';
    reason: string | null;
  } | null;
};

export type ResetStorageResult = {
  site: string;
  archive: string;
  objectsDeleted: number;
  resumed: boolean;
  codePrepare: {
    operation: string | null;
    state: string;
    siteRelease: string | null;
    codeRelease: string | null;
  };
  sync: {
    operation: string | null;
    state: string;
  };
};

export type SiteCreateResult = {
  site: string;
  org: string;
  addresses: {
    live: string | null;
    preview: string | null;
    branchPattern: string | null;
  };
  releaseOne:
    | {
        state: 'done';
        siteRelease: string;
        codeRelease: string;
        commit: string;
      }
    | {
        state: 'waiting';
      };
  bucketCreated: boolean;
};

export type SyncResultCore = {
  results: Array<{
    site: string;
    source: string;
    plugin: string;
    mode: 'working-folder' | 'snapshot';
    status: string;
    accepted: boolean;
    code: string | null;
    message: string;
    attempt: number | null;
    snapshot: string | null;
    selected: {
      snapshot: string;
      sequence: number;
      selected_at: string;
    } | null;
    config_digest: string;
    consistency: unknown | null;
    revision: string | null;
    binding: string | null;
    items: Array<{
      native_id: string;
      page_id: string;
      path: string;
      document: string;
      revision: string | null;
      digest: string;
      locations: unknown;
      observed?: unknown;
    }>;
    diagnostics: Array<{
      code: string;
      severity: 'error' | 'warning';
      operation: string;
      source: string;
      nativeId: string | null;
      origin:
        | {
            kind: 'file';
            file: string;
            line: number;
            column: number;
          }
        | {
            kind: 'element';
            document: string;
            tab?: string | null;
            element: string;
            field?: string | null;
          }
        | null;
      message: string;
      fix: string | null;
      retryable: boolean;
      claimants?: Array<{
        document: string | null;
        nativeId: string;
        modifiedAt: string | null;
        path: string;
      }>;
    }>;
    problems?: Array<{
      severity: 'error' | 'warning' | 'info';
      code: string;
      source: string | null;
      file: string | null;
      line: number | null;
      page: {
        title: string | null;
        lang: string | null;
        path: string | null;
      } | null;
      url: string | null;
      message: string;
      hint: string | null;
      details: string | null;
      facts: {
        [key: string]: unknown;
      };
    }>;
    retryAfterMs?: number | null;
    acquisition?: {
      provider: string;
      commit: string | null;
      treeOid: string | null;
      method: string | null;
      entries: number;
      readable: number;
      downloaded: number;
      repaired: number;
      requests: number;
      notes: Array<{
        code: string;
        severity: string;
        message: string;
      }>;
    };
    scope?: unknown;
  }>;
};

export type BranchResultCore = {
  branch: string;
  label: string | null;
  state: string;
  code: string | null;
  message: string | null;
  generation: number | null;
  selection: string | null;
  codeRelease: string | null;
  sourceRevision: string | null;
  host: string | null;
  hostNote: string | null;
  releasedHost: string | null;
  previewUrl: string | null;
  siteBranchUrl: string | null;
  prepared: {
    operationId: string;
    state: string;
    code: string | null;
    message: string | null;
    siteRelease: string | null;
    generation: number | null;
    codeRelease: string | null;
    sourceRevision: string | null;
    previousSiteRelease: string | null;
    diagnostics: Array<{
      code: string;
      severity: 'error' | 'warning';
      file: string;
      line: number;
      column: number;
      message: string;
      fix: string | null;
    }>;
    warnings: string[];
    delivery: {
      state: 'done' | 'pending' | 'not_required';
      reason: string | null;
    } | null;
  } | null;
};
