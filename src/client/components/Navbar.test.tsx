import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { queryKeys } from '../lib/queryKeys';
import { Navbar } from './Navbar';

function renderNavbar(user: { displayName: string } | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-seed the auth query so useAuth() resolves without firing a relative
  // /api/auth/me fetch (anonymous fixture by default).
  queryClient.setQueryData(queryKeys.auth, { user });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('Navbar brand', () => {
  it('renders the GAMEVENTORY brand link with an inline meeple svg', () => {
    renderNavbar();

    const brandLink = screen.getByRole('link', { name: /gameventory/i });
    expect(brandLink).toBeInTheDocument();

    const svg = brandLink.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    const path = svg?.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.hasAttribute('fill')).toBe(false);
  });

  it('no longer renders the dice glyph in the brand link', () => {
    renderNavbar();
    const brandLink = screen.getByRole('link', { name: /gameventory/i });
    // Build the dice code point programmatically so the literal glyph never
    // lands under src/ (keeps the zero-grep invariant intact).
    expect(brandLink).not.toHaveTextContent(String.fromCodePoint(0x1f3b2));
  });
});

describe('Navbar admin link (access-control gate)', () => {
  it('is absent for an anonymous user', () => {
    renderNavbar(null);
    expect(screen.queryByRole('link', { name: /^Admin$/ })).toBeNull();
  });

  it('is visible for an admin', () => {
    renderNavbar({ displayName: 'Todd' });
    expect(screen.getByRole('link', { name: /^Admin$/ })).toHaveAttribute('href', '/admin');
  });
});
