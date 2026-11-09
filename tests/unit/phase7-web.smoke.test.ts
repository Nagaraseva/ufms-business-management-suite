import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

async function renderPage(path: string, element: ReactNode): Promise<string> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    // @ts-ignore — server render is enough for smoke
    (await import('react')).createElement(MemoryRouter, { initialEntries: [path] },
      (await import('react')).createElement(QueryClientProvider, { client: qc }, element)
    )
  );
}

describe('Phase 7 pages render without crashing', () => {
  it('Marketing renders tabs and Rule 19 notice', async () => {
    const { default: Marketing } = await import('../../apps/web/src/pages/Marketing');
    const html = await renderPage('/marketing', (await import('react')).createElement(Marketing));
    expect(html).toContain('Marketing &amp; Communication');
    expect(html).toContain('Contacts');
  });
  it('Reports renders overview / daily / MOM tabs', async () => {
    const { default: Reports } = await import('../../apps/web/src/pages/Reports');
    const html = await renderPage('/reports', (await import('react')).createElement(Reports));
    expect(html).toContain('Reports &amp; Dashboards');
    expect(html).toContain('Overview');
  });
  it('AiAssistant renders chat and approval gate', async () => {
    const { default: AiAssistant } = await import('../../apps/web/src/pages/AiAssistant');
    const html = await renderPage('/ai', (await import('react')).createElement(AiAssistant));
    expect(html).toContain('AI Assistant');
    expect(html).toContain('Rule 19');
  });
  it('CreativeStudio renders projects tab', async () => {
    const { default: CreativeStudio } = await import('../../apps/web/src/pages/CreativeStudio');
    const html = await renderPage('/creative', (await import('react')).createElement(CreativeStudio));
    expect(html).toContain('Creative Studio');
    expect(html).toContain('Projects');
  });
});
