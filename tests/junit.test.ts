import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJUnitXml } from '../src/ingest/junit';

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures/junit', name), 'utf8');
}

describe('parseJUnitXml', () => {
  it('parses Jest-style output', () => {
    const cases = parseJUnitXml(fixture('jest-junit.xml'));
    expect(cases).toHaveLength(3);
    const statuses = cases.map((c) => c.status).sort();
    expect(statuses).toEqual(['failed', 'passed', 'skipped']);
    const failed = cases.find((c) => c.status === 'failed')!;
    expect(failed.name).toBe('subtracts');
  });

  it('parses surefire (Java/Maven) output including errors', () => {
    const cases = parseJUnitXml(fixture('surefire.xml'));
    expect(cases).toHaveLength(4);
    const errored = cases.find((c) => c.status === 'errored');
    expect(errored?.name).toBe('explodes');
    const failed = cases.find((c) => c.status === 'failed');
    expect(failed?.name).toBe('divides');
  });

  it('parses pytest output', () => {
    const cases = parseJUnitXml(fixture('pytest.xml'));
    const skipped = cases.find((c) => c.status === 'skipped');
    expect(skipped?.name).toBe('test_skip');
    const failed = cases.find((c) => c.status === 'failed');
    expect(failed?.name).toBe('test_fail');
  });

  it('converts seconds to milliseconds', () => {
    const cases = parseJUnitXml(fixture('jest-junit.xml'));
    const passed = cases.find((c) => c.status === 'passed')!;
    // 0.012s -> 12ms
    expect(passed.time).toBe(12);
  });

  it('is robust to an empty document', () => {
    expect(parseJUnitXml('')).toEqual([]);
    expect(parseJUnitXml('<testsuites></testsuites>')).toEqual([]);
  });
});
