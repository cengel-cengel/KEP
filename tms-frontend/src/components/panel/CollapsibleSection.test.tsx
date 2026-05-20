/**
 * S-3 Render-Test CollapsibleSection.
 * Verifiziert: defaultOpen, Toggle, localStorage-Persistenz, badge,
 * alwaysVisible-Prop.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CollapsibleSection from './CollapsibleSection';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('CollapsibleSection', () => {
  it('defaultOpen=false versteckt children', () => {
    render(
      <CollapsibleSection title="Test">
        <div>Hidden-Content</div>
      </CollapsibleSection>,
    );
    expect(screen.queryByText('Hidden-Content')).not.toBeInTheDocument();
  });

  it('defaultOpen=true zeigt children', () => {
    render(
      <CollapsibleSection title="Test" defaultOpen>
        <div>Visible-Content</div>
      </CollapsibleSection>,
    );
    expect(screen.getByText('Visible-Content')).toBeInTheDocument();
  });

  it('Klick auf Header togglet open', () => {
    render(
      <CollapsibleSection title="Toggle-Test">
        <div>Toggle-Content</div>
      </CollapsibleSection>,
    );
    expect(screen.queryByText('Toggle-Content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Toggle-Test'));
    expect(screen.getByText('Toggle-Content')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toggle-Test'));
    expect(screen.queryByText('Toggle-Content')).not.toBeInTheDocument();
  });

  it('storageKey persistiert open-state', () => {
    const { unmount } = render(
      <CollapsibleSection title="Persist" storageKey="test-persist">
        <div>Persist-Content</div>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByText('Persist'));
    expect(screen.getByText('Persist-Content')).toBeInTheDocument();
    // Verify localStorage shape
    expect(localStorage.getItem('tms.panel.section.test-persist')).toBe('1');
    unmount();
    // Re-mount: liest aus localStorage und ist initial open
    render(
      <CollapsibleSection title="Persist" storageKey="test-persist">
        <div>Persist-Content</div>
      </CollapsibleSection>,
    );
    expect(screen.getByText('Persist-Content')).toBeInTheDocument();
  });

  it('badge wird im Header gerendert', () => {
    render(
      <CollapsibleSection title="Header" badge={<span>3</span>}>
        <div />
      </CollapsibleSection>,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('alwaysVisible bleibt auch wenn collapsed', () => {
    render(
      <CollapsibleSection
        title="X"
        alwaysVisible={<div>Always-Here</div>}
      >
        <div>Collapsed-Content</div>
      </CollapsibleSection>,
    );
    expect(screen.getByText('Always-Here')).toBeInTheDocument();
    expect(screen.queryByText('Collapsed-Content')).not.toBeInTheDocument();
  });
});
