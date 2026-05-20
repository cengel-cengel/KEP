import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InsertModeBanner from './InsertModeBanner';

describe('InsertModeBanner', () => {
  it('rendert nicht wenn inactive', () => {
    const { container } = render(
      <InsertModeBanner active={false} onCancel={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert Banner wenn aktiv', () => {
    render(<InsertModeBanner active={true} onCancel={() => {}} />);
    expect(screen.getByTestId('insert-mode-banner')).toBeInTheDocument();
    expect(screen.getByText('Insert-Mode aktiv')).toBeInTheDocument();
  });

  it('Cancel-Btn ruft onCancel', () => {
    const fn = vi.fn();
    render(<InsertModeBanner active={true} onCancel={fn} />);
    fireEvent.click(screen.getByLabelText('Insert-Mode beenden'));
    expect(fn).toHaveBeenCalled();
  });
});
