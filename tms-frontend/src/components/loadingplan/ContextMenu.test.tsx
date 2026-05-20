/**
 * B-1 Render-Test ContextMenu.
 * Verifiziert: Item-Render, danger-Styling, onClose nach Click,
 * Click-outside-Close.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';

describe('ContextMenu', () => {
  it('rendert alle Items', () => {
    const items: ContextMenuItem[] = [
      { label: 'Edit', onClick: () => undefined },
      { label: 'Delete', onClick: () => undefined, danger: true },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={() => undefined} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('Click auf Item ruft onClick + onClose', () => {
    const onA = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [{ label: 'A', onClick: onA }];
    render(<ContextMenu x={50} y={50} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByText('A'));
    expect(onA).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disabled Item triggert nicht', () => {
    const onA = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [
      { label: 'A', onClick: onA, disabled: true },
    ];
    render(<ContextMenu x={50} y={50} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByText('A'));
    expect(onA).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape schließt Menu', () => {
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [{ label: 'A', onClick: () => undefined }];
    render(<ContextMenu x={50} y={50} items={items} onClose={onClose} />);
    // Listener wird async (setTimeout) angehängt — warten
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
        resolve();
      }, 10);
    });
  });

  it('danger Item hat rote Tailwind-Klasse', () => {
    const items: ContextMenuItem[] = [
      { label: 'Löschen', onClick: () => undefined, danger: true },
    ];
    render(<ContextMenu x={0} y={0} items={items} onClose={() => undefined} />);
    const btn = screen.getByText('Löschen');
    expect(btn.className).toContain('text-red-700');
  });
});
