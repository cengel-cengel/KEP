import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CustomerTierBadge from './CustomerTierBadge';

describe('CustomerTierBadge', () => {
  it('VIP non-compact: Letter V sichtbar', () => {
    render(<CustomerTierBadge tier="VIP" />);
    expect(screen.getByText('V')).toBeInTheDocument();
  });
  it('compact: kein Letter im DOM', () => {
    render(<CustomerTierBadge tier="VIP" compact />);
    expect(screen.queryByText('V')).not.toBeInTheDocument();
  });
  it('alle 4 Tiers rendern unterschiedliche Letter', () => {
    const { rerender } = render(<CustomerTierBadge tier="A" />);
    expect(screen.getByText('A')).toBeInTheDocument();
    rerender(<CustomerTierBadge tier="B" />);
    expect(screen.getByText('B')).toBeInTheDocument();
    rerender(<CustomerTierBadge tier="C" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });
  it('null Tier → "—"', () => {
    render(<CustomerTierBadge tier={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
