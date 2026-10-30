import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt } from './render';
import { LegalPage } from '../pages/legal/LegalPage';
import { useDeployment } from '../lib/deployment';
import { LEGAL_VERSION } from '@chub/shared/lib/legal';

vi.mock('../lib/deployment', () => ({ useDeployment: vi.fn() }));

const DRAFT_BANNER = 'Draft: needs legal review. This document has not been reviewed by a lawyer and is not yet in force.';

beforeEach(() => {
  vi.mocked(useDeployment).mockReset();
});

describe('legal pages', () => {
  it('LP1 the AU privacy notice shows the draft banner and its heading', () => {
    vi.mocked(useDeployment).mockReturnValue({ region: 'AU', otherRegionUrl: null, legalVersion: LEGAL_VERSION });
    renderAt('/legal/privacy', '/legal/:doc', <LegalPage />);
    expect(screen.getByRole('heading', { name: 'Privacy notice' })).toBeInTheDocument();
    expect(screen.getByText(DRAFT_BANNER)).toBeInTheDocument();
  });

  it('LP2 the UK processing terms show the UK version line', () => {
    vi.mocked(useDeployment).mockReturnValue({ region: 'UK', otherRegionUrl: null, legalVersion: LEGAL_VERSION });
    renderAt('/legal/processing', '/legal/:doc', <LegalPage />);
    expect(screen.getByText('Region: the United Kingdom', { exact: false })).toBeInTheDocument();
  });

  it('LP3 an unknown document shows Page not found', () => {
    vi.mocked(useDeployment).mockReturnValue({ region: 'AU', otherRegionUrl: null, legalVersion: LEGAL_VERSION });
    renderAt('/legal/nope', '/legal/:doc', <LegalPage />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
