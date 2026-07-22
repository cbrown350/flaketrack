import type { FlakeAssessment } from '../types';

/**
 * Emit a machine-readable quarantine skip-list as a JSON artifact.
 *
 * FlakeTrack does NOT mutate your test source. It produces this list; your own
 * CI consumes it to decide what to skip or retry. Read-only by design — the
 * customer stays in control of whether to honor it.
 */
export function emitQuarantineList(
  assessments: FlakeAssessment[],
): { flaky: FlakeAssessment[]; generatedAt: string } {
  return {
    flaky: assessments.filter((a) => a.isFlaky),
    generatedAt: new Date().toISOString(),
  };
}

export function quarantineToMarkdown(list: ReturnType<typeof emitQuarantineList>): string {
  if (list.flaky.length === 0) {
    return '_No flaky tests detected._\n';
  }
  const rows = list.flaky
    .map(
      (a) =>
        `| \`${a.className}#${a.name}\` | ${(a.flakeRate * 100).toFixed(1)}% | ${a.sampleSize} |`,
    )
    .join('\n');
  return `## FlakeTrack quarantine list

Generated ${list.generatedAt}.

| Test | Fail rate | Samples |
|---|---|---|
${rows}
`;
}
