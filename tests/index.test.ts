import { afterEach, describe, expect, it, vi } from 'vitest';

const getInput = vi.fn();
const globSync = vi.fn();

vi.mock('@actions/core', () => ({
  getInput,
  info: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

vi.mock('glob', () => ({ globSync }));

describe('FlakeTrack Action', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('falls back to JUnit and Surefire report patterns', async () => {
    getInput.mockReturnValue('');
    globSync.mockReturnValue([]);

    await import('../src/index');

    expect(globSync).toHaveBeenCalledWith(['**/junit*.xml', '**/TEST-*.xml']);
  });
});
