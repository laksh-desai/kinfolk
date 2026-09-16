import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BrandFooter, BrandLockup, BrandMark, COMPANY, Wordmark } from './Brand';

const inRouter = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('ATS branding (ADR 033)', () => {
  it('names the product and the company once, and links home', () => {
    inRouter(<Wordmark />);
    const home = screen.getByRole('link', { name: `Kinfolk by ${COMPANY} — home` });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveTextContent('Kinfolk');
    expect(home).toHaveTextContent(`by ${COMPANY}`);
    // The tree beside the name is decoration: the name is already there to read.
    expect(home.querySelector('.brand-mark')).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives the lockup a name of its own, since no text sits beside it', () => {
    render(<BrandLockup />);
    expect(screen.getByRole('img', { name: COMPANY })).toHaveClass('brand-lockup');
  });

  it('labels a mark that stands alone', () => {
    render(<BrandMark label="ATS" />);
    expect(screen.getByRole('img', { name: 'ATS' })).toHaveClass('brand-mark');
  });

  it('puts the footer lockup inside a landmark, so no content sits outside one', () => {
    render(<BrandFooter />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`Kinfolk is provided by ${COMPANY}.`);
  });
});
