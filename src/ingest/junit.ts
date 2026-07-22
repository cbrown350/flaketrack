import { XMLParser } from 'fast-xml-parser';
import type { TestCase, TestStatus } from '../types';

/**
 * Parse a JUnit XML document into normalized TestCases.
 *
 * JUnit XML is the closest thing to a universal test-report interchange format.
 * We handle the common shapes emitted by surefire (JUnit/Java), pytest,
 * Jest (jest-junit), PHPUnit, and .NET (with adapters). `<failure>` and
 * `<error>` children mark a test failed/errored; `<skipped>` marks skipped.
 * Everything else is a pass.
 *
 * Test identity is `${classname}#${name}` — stable across runs even when the
 * suite file path changes, which is what matters for flake trending.
 */
export function parseJUnitXml(xml: string): TestCase[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (node: string) =>
      node === 'testcase' || node === 'testsuite' || node === 'testsuites',
  });
  const doc = parser.parse(xml);
  const suites = unwrapSuites(doc);
  const cases: TestCase[] = [];
  for (const suite of suites) {
    const suiteCases = Array.isArray(suite.testcase) ? suite.testcase : [];
    for (const tc of suiteCases) {
      cases.push(toTestCase(tc, suite));
    }
  }
  return cases;
}

function unwrapSuites(doc: unknown): Record<string, unknown>[] {
  if (!doc || typeof doc !== 'object') return [];
  const docObj = doc as Record<string, unknown>;
  // Root may be <testsuites>...</testsuites> or a bare <testsuite>.
  const root = docObj.testsuites ?? docObj;
  const suitesArr = Array.isArray(root) ? root : [root];
  const out: Record<string, unknown>[] = [];
  for (const entry of suitesArr) {
    if (!entry || typeof entry !== 'object') continue;
    const ts = (entry as Record<string, unknown>).testsuite;
    if (!ts) continue;
    const tsArr = Array.isArray(ts) ? ts : [ts];
    out.push(...(tsArr as Record<string, unknown>[]));
  }
  return out;
}

function toTestCase(
  tc: Record<string, unknown>,
  suite: Record<string, unknown>,
): TestCase {
  const name = String(tc.name ?? '<unnamed>');
  // Prefer testcase-level classname; fall back to the enclosing testsuite name.
  const className = String(tc.classname ?? suite.name ?? '<unknown>');
  const timeRaw = typeof tc.time === 'number' ? tc.time : parseFloat(String(tc.time ?? 0));
  const timeMs = Number.isFinite(timeRaw) ? Math.round(timeRaw * 1000) : 0;
  return {
    className,
    name,
    time: timeMs,
    status: statusOf(tc),
  };
}

function statusOf(tc: Record<string, unknown>): TestStatus {
  if (hasChild(tc, 'skipped')) return 'skipped';
  if (hasChild(tc, 'error')) return 'errored';
  if (hasChild(tc, 'failure')) return 'failed';
  return 'passed';
}

function hasChild(tc: Record<string, unknown>, child: string): boolean {
  const v = tc[child];
  // The parser may emit an empty self-closing tag as an empty object or "".
  return v !== undefined && v !== null;
}
