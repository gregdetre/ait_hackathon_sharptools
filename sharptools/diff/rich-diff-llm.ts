#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 -p @anthropic-ai/sdk@^0.21 -p nunjucks@^3 -p dotenv@^16 tsx

/**
 * Rich Diff Generator (LLM-backed: Pass A/B/C via Anthropic)
 *
 * - Reads BasicDiff JSON and optional TS enrichment bundle
 * - Pass A: Per-hunk item extraction using prompts/templates/pass_a_item_extraction.md.njk
 * - Pass B: Global clustering and summary using prompts/templates/pass_b_clustering.md.njk
 * - Pass C: Per-cluster Mermaid synthesis using prompts/templates/pass_c_diagram.md.njk
 * - Produces a RichDiff JSON document
 *
 * Fallback: If ANTHROPIC_API_KEY is missing or any call fails, generate a heuristic stub
 *           similar to sharptools/diff/rich-diff.ts so the pipeline still completes.
 */

import { Cli, Command, Option } from 'clipanion';
import { readFile, writeFile } from 'fs/promises';
import { resolve, join } from 'path';
import { config as dotenvConfig } from 'dotenv';
import nunjucks from 'nunjucks';
import type { BasicDiff, RichDiff, RichItem, Cluster, Callout, EvidenceRef } from '../claude-conversation-exporter/types/diff-schemas';

// Lazy import Anthropic to allow running without the package if not used
let AnthropicMod: any = null;

interface EnrichmentBundle {
  createdAtIso?: string;
  files?: Record<string, {
    fileId: string;
    layer?: 'frontend' | 'backend' | 'tests' | 'docs' | 'unknown';
    symbols?: string[];
    exports?: string[];
    churn?: { additions: number; deletions: number; hunks: number };
  }>;
  hunks?: Record<string, {
    fileId: string;
    hunkId: string;
    symbolsNearChange?: string[];
  }>;
}

function nowIso(): string { return new Date().toISOString(); }

function ensureArray<T>(val: any): T[] { return Array.isArray(val) ? val : (val == null ? [] : [val]); }

function firstTextFromAnthropic(resp: any): string {
  if (!resp) return '';
  const content = (resp as any).content;
  if (Array.isArray(content)) {
    const t = content.find((c: any) => c && c.type === 'text');
    return (t && t.text) ? String(t.text) : '';
  }
  return typeof content === 'string' ? content : '';
}

function extractFirstJsonCandidate(text: string): string | null {
  const trimmed = String(text || '').trim();
  // Remove common fences if present
  const fence = trimmed.match(/```(?:json)?\n([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  // Fast path
  try { JSON.parse(candidate); return candidate; } catch {/* continue */}
  // Attempt to find the first balanced JSON object region
  const startIdx = candidate.indexOf('{');
  const endIdx = candidate.lastIndexOf('}');
  if (startIdx >= 0 && endIdx > startIdx) {
    for (let i = endIdx; i >= startIdx; i--) {
      const slice = candidate.slice(startIdx, i + 1);
      try { JSON.parse(slice); return slice; } catch {/* keep shrinking */}
    }
  }
  return null;
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

function toEvidenceForFile(fileId: string): EvidenceRef { return { fileId }; }

function configureNunjucks(templatesDir: string): nunjucks.Environment {
  const env = nunjucks.configure(templatesDir, { autoescape: false, noCache: true });
  return env;
}

async function callAnthropicJSON(apiKey: string, model: string, system: string, prompt: string, maxTokens = 4000): Promise<any> {
  if (!AnthropicMod) {
    // dynamic import to keep startup fast
    try {
      const m = await import('@anthropic-ai/sdk');
      AnthropicMod = (m as any).default || m;
    } catch (err) {
      throw new Error('Anthropic SDK not available');
    }
  }
  const anthropic = new AnthropicMod({ apiKey });
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    system,
    messages: [ { role: 'user', content: prompt } ],
  } as any);
  const raw = firstTextFromAnthropic(response);
  const jsonStr = extractFirstJsonCandidate(raw);
  if (!jsonStr) throw new Error('Model did not return JSON');
  try {
    return JSON.parse(jsonStr);
  } catch (err: any) {
    throw new Error('Failed to parse JSON from model response');
  }
}

function makeItemId(fileId: string, hunkId: string | undefined, index: number): string {
  const h = hunkId ? `_${hunkId}` : '';
  return `i_${fileId}${h}_${index}`;
}

function heuristicFallback(basic: BasicDiff): RichDiff {
  const items: RichItem[] = [];
  const clusters: Cluster[] = [];
  const callouts: Callout[] = [];
  for (const f of basic.files) {
    const changeKind: any = f.language === 'md' ? 'docs' : f.language === 'test' ? 'test' : 'chore';
    const headline = `${f.status} ${f.pathNew || f.pathOld}`;
    const what = `Changed ${f.stats.hunks} hunk(s) with +${f.stats.additions}/-${f.stats.deletions}.`;
    const evidence: EvidenceRef[] = [toEvidenceForFile(f.id)];
    items.push({
      id: `i_${f.id}`,
      fileId: f.id,
      kind: changeKind,
      headline,
      whatChanged: what,
      importance: 2,
      risk: 2,
      confidence: 0.5,
      evidence,
    });
  }
  return {
    meta: {
      createdAtIso: nowIso(),
      model: { provider: 'local', name: 'heuristic' },
      promptVersion: 'v0-stub',
      basicDiffRef: { hash: 'not-computed' },
      goalRef: { planningDocPath: 'planning/250920a_diff_visualizer_planning.md', goalSummary: 'Diff Visualizer MVP' },
    },
    summary: {
      headline: 'Diff summary (stubbed)',
      narrative: 'This is a heuristic summary without LLM calls.',
      keyCallouts: callouts,
      totals: { filesChanged: basic.totals.filesChanged, additions: basic.totals.additions, deletions: basic.totals.deletions, clusters: clusters.length },
    },
    clusters,
    items,
  };
}

class RichDiffLlmCommand extends Command {
  static paths = [["rich-diff-llm"], Command.Default];

  static usage = Command.Usage({
    description: 'Produce a RichDiff JSON from BasicDiff + enrichment using Anthropic prompts (Pass A/B/C)',
    examples: [
      ['Generate rich diff (LLM)', 'rich-diff-llm -i out/basic-diff.json -e out/enrichment.json -o out/rich-diff.json'],
    ],
  });

  inputFile = Option.String('--input,-i', { required: true, description: 'BasicDiff JSON path' });
  enrichmentFile = Option.String('--enrichment,-e', { required: false, description: 'Optional enrichment JSON path' });
  model = Option.String('--model', 'claude-3-5-sonnet-20240620', { description: 'Anthropic model id' });
  promptVersion = Option.String('--prompt-version', 'v1-llm', { description: 'Prompt version tag' });
  outputFile = Option.String('--output,-o', { required: true, description: 'Output RichDiff JSON path' });
  templatesDir = Option.String('--templates-dir', 'prompts/templates', { description: 'Directory containing .md.njk templates' });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    // Ensure env
    const envPath = resolve(process.cwd(), '.env.local');
    dotenvConfig({ path: envPath });
    const apiKey = process.env.ANTHROPIC_API_KEY;

    try {
      const basic: BasicDiff = await readJsonFile<BasicDiff>(this.inputFile);
      const enrichment: EnrichmentBundle | undefined = this.enrichmentFile ? await readJsonFile<EnrichmentBundle>(this.enrichmentFile) : undefined;

      if (!apiKey) {
        if (!this.quiet) this.context.stderr.write('LLM disabled: Missing ANTHROPIC_API_KEY. Generating heuristic rich diff.\n');
        const rich = heuristicFallback(basic);
        await writeFile(resolve(this.outputFile), JSON.stringify(rich, null, 2), 'utf8');
        return 0;
      }

      const env = configureNunjucks(resolve(this.templatesDir));

      // Pass A: per-hunk item extraction
      const passAItems: RichItem[] = [];
      const systemA = [
        'You are a diff analyst. Output STRICT JSON only. No markdown, no fences.',
        'Follow the contract in the prompt exactly. Do not invent symbols.',
      ].join(' ');

      for (const f of basic.files) {
        const isTs = (f.language === 'ts' || f.language === 'tsx');
        if (!isTs || f.isBinary) continue;
        for (const h of f.hunks) {
          const fileEn = enrichment?.files?.[f.id];
          const hunkKey = `${f.id}|${h.id}`;
          const hunkEn = enrichment?.hunks?.[hunkKey];
          const tsEntities = {
            file: fileEn ? { symbols: fileEn.symbols, exports: fileEn.exports } : undefined,
            hunk: hunkEn ? { symbolsNearChange: hunkEn.symbolsNearChange } : undefined,
          };
          const hints = { layer: fileEn?.layer };
          const meta = { createdAtIso: nowIso(), model: { provider: 'anthropic', name: this.model }, promptVersion: this.promptVersion };
          const inputObj = { meta, file: f, hunk: h, tsEntities, hints };
          const rendered = env.render('pass_a_item_extraction.md.njk', {
            meta_json: JSON.stringify(meta),
            file_json: JSON.stringify(f),
            hunk_json: JSON.stringify(h),
            tsEntities_json: JSON.stringify(tsEntities),
            hints_json: JSON.stringify(hints),
          });
          try {
            const a = await callAnthropicJSON(apiKey!, this.model, systemA, rendered, 4000);
            const items = ensureArray<any>(a.items);
            let idx = 0;
            for (const it of items) {
              const item: RichItem = {
                id: makeItemId(f.id, h.id, idx++),
                fileId: String(it.fileId || f.id),
                hunkId: String(it.hunkId || h.id),
                kind: it.kind || 'chore',
                headline: it.headline || 'Change',
                whatChanged: it.whatChanged || '',
                whyChanged: it.whyChanged || undefined,
                operations: it.operations || undefined,
                entities: it.entities || undefined,
                highlights: it.highlights || undefined,
                importance: it.importance ?? 2,
                risk: it.risk ?? 2,
                confidence: it.confidence ?? 0.6,
                evidence: ensureArray<EvidenceRef>(it.evidence && it.evidence.length ? it.evidence : [ { fileId: f.id, hunkId: h.id } ]),
                renderHints: it.renderHints || undefined,
              };
              passAItems.push(item);
            }
          } catch (err: any) {
            // Soft-fail per hunk and continue
            if (!this.quiet) this.context.stderr.write(`Pass A failed for ${f.id}:${h.id} → ${err?.message || err}\n`);
          }
        }
      }

      // Pass B: clustering and summary
      const systemB = [
        'You are a release note writer. Output STRICT JSON only. No markdown, no fences.',
        'Group by value/intent; write concise non-technical summary.',
      ].join(' ');

      const pathTags = Object.fromEntries((basic.files || []).map(f => [f.id, { layer: enrichment?.files?.[f.id]?.layer || 'unknown' }]));
      const totals = basic.totals;
      const metaB = { createdAtIso: nowIso(), model: { provider: 'anthropic', name: this.model }, promptVersion: this.promptVersion };
      const passBRendered = env.render('pass_b_clustering.md.njk', {
        meta_json: JSON.stringify(metaB),
        totals_json: JSON.stringify(totals),
        pathTags_json: JSON.stringify(pathTags),
        items_json: JSON.stringify(passAItems),
      });

      let clusters: Cluster[] = [];
      let summary: RichDiff['summary'] | null = null;
      try {
        const b = await callAnthropicJSON(apiKey!, this.model, systemB, passBRendered, 4000);
        const rawClusters = ensureArray<any>(b.clusters);
        clusters = rawClusters.map((c: any, i: number) => ({
          id: c.id || `cl${i + 1}`,
          title: c.title || 'Cluster',
          kind: c.kind || 'chore',
          description: c.description || '',
          importance: c.importance ?? 2,
          risk: c.risk ?? 2,
          confidence: c.confidence ?? 0.6,
          heuristics: ensureArray<string>(c.heuristics || []),
          members: ensureArray<any>(c.members || []).map((m: any) => ({ itemId: m.itemId })),
          mermaid: c.mermaid || undefined,
        }));
        const s = b.summary || {};
        const callouts = ensureArray<any>(s.keyCallouts || []).map((k: any, j: number) => ({
          id: k.id || `c${j + 1}`,
          title: k.title || '',
          whyItMatters: k.whyItMatters || '',
          importance: k.importance ?? 2,
          risk: k.risk ?? 2,
          confidence: k.confidence ?? 0.6,
          references: ensureArray<EvidenceRef>(k.references || []),
        }));
        summary = {
          headline: s.headline || 'Diff summary',
          narrative: s.narrative || '',
          keyCallouts: callouts,
          totals: s.totals || { filesChanged: totals.filesChanged, additions: totals.additions, deletions: totals.deletions, clusters: clusters.length },
        };
      } catch (err: any) {
        if (!this.quiet) this.context.stderr.write(`Pass B failed → ${err?.message || err}\n`);
        // Proceed with empty clusters and a simple summary
        summary = {
          headline: 'Diff summary (LLM partial)',
          narrative: 'Clustering unavailable due to model error.',
          keyCallouts: [],
          totals: { filesChanged: basic.totals.filesChanged, additions: basic.totals.additions, deletions: basic.totals.deletions, clusters: 0 },
        };
        clusters = [];
      }

      // Pass C: per-cluster Mermaid
      const systemC = [
        'You generate Mermaid diagram JSON only. Output { "mermaid": "..." } or { "mermaid": null }.',
        'No markdown, no fences, no prose.',
      ].join(' ');
      const finalClusters: Cluster[] = [];
      for (const c of clusters) {
        try {
          const passCRendered = env.render('pass_c_diagram.md.njk', {
            cluster_json: JSON.stringify(c),
            items_json: JSON.stringify(passAItems),
          });
          const cr = await callAnthropicJSON(apiKey!, this.model, systemC, passCRendered, 1200);
          const mermaid = (cr && typeof cr.mermaid !== 'undefined') ? cr.mermaid : null;
          finalClusters.push({ ...c, mermaid: typeof mermaid === 'string' ? mermaid : undefined });
        } catch (err: any) {
          if (!this.quiet) this.context.stderr.write(`Pass C failed for ${c.id} → ${err?.message || err}\n`);
          finalClusters.push(c);
        }
      }

      const rich: RichDiff = {
        meta: {
          createdAtIso: nowIso(),
          model: { provider: 'anthropic', name: this.model },
          promptVersion: this.promptVersion,
          basicDiffRef: { hash: 'not-computed' },
          goalRef: { planningDocPath: 'planning/250920a_diff_visualizer_planning.md', goalSummary: 'Diff Visualizer MVP' },
        },
        summary: summary!,
        clusters: finalClusters,
        items: passAItems,
      };

      await writeFile(resolve(this.outputFile), JSON.stringify(rich, null, 2), 'utf8');
      return 0;
    } catch (err: any) {
      if (!this.quiet) {
        const message = err instanceof Error ? err.message : String(err);
        this.context.stderr.write(`Error: ${message}\n`);
      }
      // Attempt heuristic fallback
      try {
        const basic: BasicDiff = await readJsonFile<BasicDiff>(this.inputFile);
        const rich = heuristicFallback(basic);
        await writeFile(resolve(this.outputFile), JSON.stringify(rich, null, 2), 'utf8');
        return 0;
      } catch {
        return 1;
      }
    }
  }
}

const cli = new Cli({ binaryLabel: 'Rich Diff (LLM)', binaryName: 'rich-diff-llm', binaryVersion: '1.0.0' });
cli.register(RichDiffLlmCommand);
cli.runExit(process.argv.slice(2));



