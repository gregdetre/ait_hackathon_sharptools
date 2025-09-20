/**
 * Diff Visualizer Data Structures
 *
 * This module defines the TypeScript types for the two-layer diff model:
 * 1) BasicDiff: A deterministic, lossless representation of a Git text diff
 * 2) RichDiff:  An LLM-augmented, value-focused interpretation layered on top
 *
 * Design goals:
 * - BasicDiff must be faithful to git diff semantics and stable for UI anchoring
 * - RichDiff references BasicDiff by IDs only; it never duplicates patch text
 * - Optional attachments (e.g., code context) are embedded near their owners
 * - All IDs should be deterministic for stable hyperlinks and caching
 */

// ------------------------------
// Basic Diff Layer (deterministic)
// ------------------------------

export type ColorMode = 'auto' | 'always' | 'never';
export type LineOp = 'context' | 'add' | 'del';

/**
 * Reference to a Git blob.
 * `oid` is typically the 40-hex SHA1 or repository hash; `ref` may capture a ref name.
 */
export interface BlobRef {
  oid?: string;
  ref?: string;
  size?: number;
}

/**
 * Optional file-level attachments that are expensive or large. Off by default.
 */
export interface FileAttachments {
  /** Raw blob identities for before/after to enable on-demand fetching. */
  blobs?: {
    before?: BlobRef;
    after?: BlobRef;
  };
  /** Optional entire file snapshots (use size caps; avoid by default). */
  fileSnapshot?: {
    before?: string;
    after?: string;
    sizeCap?: number;
    truncated?: boolean;
  };
}

/**
 * Optional hunk-level attachments.
 */
export interface HunkAttachments {
  /**
   * Surrounding source code lines from base/head checkouts.
   * Include only when configured (e.g., radius=20). Lines do not include trailing newlines.
   */
  context?: {
    radius: number;
    before?: string[];
    after?: string[];
  };
}

export interface HunkLine {
  /** Stable sequence-local identifier for cross-referencing. */
  id: string;
  op: LineOp;
  /** Content of the line without trailing newline. */
  text: string;
  /** Original line number in the old file; null where not applicable. */
  oldNumber?: number | null;
  /** New line number in the new file; null where not applicable. */
  newNumber?: number | null;
  /** Present when word-diff parsing is active; spans within `text`. */
  intraLine?: Array<{ kind: 'eq' | 'ins' | 'del'; start: number; end: number }>;
  /** True when the diff notes "No newline at end of file". */
  noNewlineAtEndOfFile?: boolean;
}

export interface Hunk {
  /** Deterministic hunk identifier within a file. */
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Content hash for caching (e.g., sha256 of normalized header+lines). */
  contentHash?: string;
  /** Optional text that appears after the @@ header (function/scope hint). */
  sectionHeading?: string;
  lines: HunkLine[];
  /** Raw hunk header, e.g., "@@ -a,b +c,d @@ optional". */
  rawHeader?: string;
  attachments?: HunkAttachments;
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'modeChanged'
  | 'typeChanged'
  | 'unmerged'
  | 'unknown';

export interface FileDiff {
  /** Deterministic across runs for the same file change; used as a stable anchor. */
  id: string;
  pathOld?: string;
  pathNew?: string;
  status: FileStatus;
  isBinary: boolean;
  /** Best-effort language by file extension, e.g., "ts", "tsx". */
  language?: string;
  /** For rename/copy cases. */
  similarityIndex?: number;
  modeBefore?: string;
  modeAfter?: string;
  stats: { additions: number; deletions: number; hunks: number };
  hunks: Hunk[];
  /** Raw per-file patch text for recovery/fallback. */
  rawPatch?: string;
  /** Optional attachments (blobs, snapshots). */
  attachments?: FileAttachments;
}

export interface BasicDiff {
  meta: {
    createdAtIso: string;
    tool: { name: 'git-diff.ts'; version: string };
    cwd: string;
    git: {
      baseRef?: string;
      headRef?: string;
      rangeArg?: string; // e.g., "abc..def" if provided
      staged: boolean;
      args: string[]; // exact args used
      colorMode: ColorMode;
      wordDiff: boolean;
      nameOnly: boolean;
      stat: boolean;
      unifiedContext?: number;
    };
  };
  totals: {
    filesChanged: number;
    additions: number;
    deletions: number;
    hunks: number;
    binaryFilesChanged: number;
  };
  files: FileDiff[];
  warnings?: string[];
}

// ------------------------------
// Rich Diff Layer (LLM-augmented)
// ------------------------------

export type ChangeKind =
  | 'feature'
  | 'fix'
  | 'refactor'
  | 'perf'
  | 'security'
  | 'docs'
  | 'test'
  | 'build'
  | 'config'
  | 'chore';

export type Importance = 1 | 2 | 3 | 4 | 5;
export type Risk = 1 | 2 | 3 | 4 | 5;

export interface EvidenceRef {
  fileId: string;
  hunkId?: string;
  lineIds?: string[];
}

export interface Callout {
  id: string;
  title: string;
  whyItMatters: string;
  importance: Importance;
  risk: Risk;
  /** LLM self-estimate 0..1. */
  confidence: number;
  references: EvidenceRef[];
}

export interface Operation {
  op:
    | 'addFunction'
    | 'removeFunction'
    | 'changeSignature'
    | 'addExport'
    | 'removeExport'
    | 'renameSymbol'
    | 'moveFile'
    | 'changeLogic'
    | 'addDependency'
    | 'updateConfig'
    | 'changeRoute'
    | 'changeSchema'
    | 'updateTest'
    | 'updateDocs';
  details?: string;
}

export interface Entities {
  /** Symbols detected (TypeScript identifiers: functions, classes, vars). */
  symbols?: string[];
  /** Exported identifiers added/removed/changed. */
  exports?: string[];
  /** HTTP endpoints inferred from routing patterns (if applicable). */
  routes?: Array<{ method: string; path: string }>;
  /** Database or schema entities (names). */
  tables?: string[];
  /** Normalized relative file paths referenced. */
  filesTouched?: string[];
  /** Configuration keys referenced or modified. */
  configKeys?: string[];
}

export interface Highlight {
  tag:
    | 'breaking'
    | 'publicApi'
    | 'securitySensitive'
    | 'perfCritical'
    | 'infra'
    | 'lowConfidence';
  note?: string;
}

export interface RenderHints {
  emphasis?: Array<'apis' | 'security' | 'perf' | 'breaking' | 'routes'>;
  preferredView?: 'byKind' | 'byRisk' | 'byImportance' | 'byLayer';
}

export interface RichItem {
  id: string;
  fileId: string;
  /** If absent, the item summarizes the whole file. */
  hunkId?: string;
  kind: ChangeKind;
  headline: string; // e.g., "Change signature of export validateSession(...)"
  whatChanged: string; // concise narrative of the diff
  whyChanged?: string; // rationale if inferable
  operations?: Operation[]; // structured semantic ops
  entities?: Entities; // extracted symbols/routes/etc.
  highlights?: Highlight[];
  importance: Importance;
  risk: Risk;
  confidence: number; // 0..1
  evidence: EvidenceRef[]; // anchors back to BasicDiff
  renderHints?: RenderHints;
}

export interface Cluster {
  id: string;
  title: string; // value/intent-oriented headline
  kind: ChangeKind;
  description: string; // business value narrative
  importance: Importance;
  risk: Risk;
  confidence: number; // 0..1
  heuristics: string[]; // short notes explaining grouping rationale
  members: Array<{ itemId: string }>;
  /** Optional Mermaid diagram describing the change (flow/seq/class). */
  mermaid?: string;
}

export interface Relation {
  kind: 'dependsOn' | 'affects' | 'duplicates' | 'renames' | 'followsFrom';
  from: { itemId: string };
  to: { itemId: string };
  note?: string;
}

export interface Views {
  byKind?: Record<ChangeKind, string[]>; // cluster ids
  byRisk?: Record<Risk, string[]>;
  byImportance?: Record<Importance, string[]>;
  byLayer?: Record<'frontend' | 'backend' | 'infra' | 'tests' | 'docs', string[]>;
}

export interface TraceAnchor {
  anchorId: string; // usable in markdown prose
  refs: EvidenceRef[];
}

export interface Trace {
  anchors: TraceAnchor[];
}

export interface RichDiff {
  meta: {
    createdAtIso: string;
    model: { provider: 'openai' | 'anthropic' | 'local'; name: string };
    promptVersion: string;
    basicDiffRef: { hash: string }; // content-hash of the BasicDiff input
    /** Optional git context carried from BasicDiff.meta.git for display */
    git?: {
      baseRef?: string;
      headRef?: string;
      rangeArg?: string;
      staged?: boolean;
    };
    goalRef?: { planningDocPath?: string; goalSummary?: string };
  };
  summary: {
    headline: string;
    narrative: string;
    keyCallouts: Callout[];
    totals: { filesChanged: number; additions: number; deletions: number; clusters: number };
  };
  clusters: Cluster[];
  items: RichItem[]; // narrative per file/hunk
  relations?: Relation[];
  views?: Views; // precomputed indices for UI
  trace?: Trace; // mapping from prose anchors to code evidence
  warnings?: string[];
}

/**
 * Exported namespace-like object for convenient imports.
 */
export const DiffSchema = {
  version: '1.1.0',
};


