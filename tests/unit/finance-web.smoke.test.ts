/**
 * Phase 6 render smoke — Finance & Assets pages.
 * Same strategy as the Phase 5 smoke suite: server-render with React, no browser.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../apps/web/src/lib/auth';
import Finance from '../../apps/web/src/pages/Finance';
import InvoiceForm from '../../apps/web/src/pages/InvoiceForm';
import InvoiceDetail from '../../apps/web/src/pages/InvoiceDetail';
import Assets from '../../apps/web/src/pages/Assets';
import Stock from '../../apps/web/src/pages/Stock';
import PurchaseOrders from '../../apps/web/src/pages/PurchaseOrders';

function render(page: any, routePath = '*', entry = '/finance') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  return renderToString(
    createElement(QueryClientProvider, { client: qc },
      createElement(MemoryRouter, { initialEntries: [entry] },
        createElement(Routes, null,
          createElement(Route, { path: routePath, element: createElement(AuthProvider, null, createElement(page)) })
        )
      )
    )
  );
}

describe('Phase 6 pages render without crashing', () => {
  it('Finance overview renders (or shows its permission notice) without crashing', () => {
    const html = render(Finance);
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('Finance');
  });
  it('InvoiceForm renders the line-item editor', () => {
    const html = render(InvoiceForm);
    expect(html).toContain('New invoice');
    expect(html).toContain('Line items');
    expect(html).toContain('Create invoice');
  });
  it('InvoiceDetail renders its loading/empty state', () => {
    const html = render(InvoiceDetail, '/finance/invoices/:id', '/finance/invoices/11111111-1111-4111-9111-111111111111');
    expect(html).toContain('Loading');
  });
  it('Assets renders (or shows its permission notice) without crashing', () => {
    const html = render(Assets);
    // Without a session the page shows a permission notice — that is the correct branch
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('asset:read');
  });
  it('Stock renders the item/purchase/distribution sections', () => {
    const html = render(Stock);
    expect(html).toContain('Stock');
    expect(html).toContain('Stock items');
  });
  it('PurchaseOrders renders the PO state machine hint', () => {
    const html = render(PurchaseOrders);
    expect(html).toContain('Purchase Orders');
    expect(html).toContain('Released');
  });
});
