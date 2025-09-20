#!/usr/bin/env -S npx -y -p tsx@^4 -p clipanion@^3 tsx

/**
 * Rich Diff Generator (LLM-augmented placeholder)
 *
 * Consumes a BasicDiff JSON and an optional enrichment bundle, then produces a
 * skeleton RichDiff document. The LLM-based itemization and clustering are
 * intentionally stubbed for now; we compute simple heuristics and structure.
 */

import { Cli, Command, Option } from 'clipanion';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { BasicDiff, RichDiff, Callout, Cluster, RichItem, EvidenceRef } from '../claude-conversation-exporter/types/diff-schemas';

interface EnrichmentBundle { files?: Record<string, any>; hunks?: Record<string, any> }

function nowIso(): string { return new Date().toISOString(); }

function toEvidenceForFile(fileId: string): EvidenceRef { return { fileId }; }

class RichDiffCommand extends Command {
  static paths = [["rich-diff"], Command.Default];

  static usage = Command.Usage({
    description: 'Produce a RichDiff JSON from BasicDiff + optional enrichment (stubbed heuristic version)',
    examples: [
      ['Generate rich diff', 'rich-diff -i out/basic-diff.json -o out/rich-diff.json'],
      ['With pre-enrichment', 'rich-diff -i out/basic-diff.json -e out/enrichment.json -o out/rich-diff.json'],
    ],
  });

  inputFile = Option.String('--input,-i', { required: true, description: 'BasicDiff JSON path' });
  enrichmentFile = Option.String('--enrichment,-e', { required: false, description: 'Optional enrichment JSON path' });
  provider = Option.String('--provider', 'openai', { description: 'Model provider label for metadata' });
  model = Option.String('--model', 'gpt-4o-mini', { description: 'Model name metadata only (no calls yet)' });
  promptVersion = Option.String('--prompt-version', 'v0-stub', { description: 'Prompt version tag' });
  outputFile = Option.String('--output,-o', { required: true, description: 'Output RichDiff JSON path' });
  quiet = Option.Boolean('--quiet,-q', false, { description: 'Suppress non-essential errors' });

  async execute(): Promise<number> {
    try {
      const basic: BasicDiff = JSON.parse(await readFile(resolve(this.inputFile), 'utf8'));
      const enrichment: EnrichmentBundle | undefined = this.enrichmentFile ? JSON.parse(await readFile(resolve(this.enrichmentFile), 'utf8')) : undefined;

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

      const rich: RichDiff = {
        meta: {
          createdAtIso: nowIso(),
          model: { provider: this.provider as any, name: this.model },
          promptVersion: this.promptVersion,
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

      await writeFile(resolve(this.outputFile), JSON.stringify(rich, null, 2), 'utf8');
      return 0;
    } catch (err: any) {
      if (!this.quiet) {
        const message = err instanceof Error ? err.message : String(err);
        this.context.stderr.write(`Error: ${message}\n`);
      }
      return 1;
    }
  }
}

const cli = new Cli({ binaryLabel: 'Rich Diff (stub)', binaryName: 'rich-diff', binaryVersion: '1.0.0' });
cli.register(RichDiffCommand);
cli.runExit(process.argv.slice(2));


