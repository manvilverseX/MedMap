import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MmCard,
  MmButton,
  MmBadge,
  MmStatusChip,
  MmIcon,
} from '../components/ui';

describe('MedMap UI Phase 1 Shared Building Blocks', () => {
  describe('MmCard', () => {
    it('renders children with default classes', () => {
      render(
        <MmCard data-testid="card-test">
          <p>Card Content</p>
        </MmCard>
      );
      const card = screen.getByTestId('card-test');
      expect(card).toBeDefined();
      expect(card.className).toContain('mm-card');
      expect(screen.getByText('Card Content')).toBeDefined();
    });

    it('passes through aria attributes and custom className', () => {
      render(
        <MmCard
          data-testid="card-aria"
          aria-label="Clinical Summary Card"
          className="custom-mm-extra"
          variant="elevated"
        >
          <span>Elevated Body</span>
        </MmCard>
      );
      const card = screen.getByTestId('card-aria');
      expect(card.getAttribute('aria-label')).toBe('Clinical Summary Card');
      expect(card.className).toContain('mm-card');
      expect(card.className).toContain('mm-card--elevated');
      expect(card.className).toContain('custom-mm-extra');
    });

    it('renders as different HTML elements via the `as` prop', () => {
      render(
        <MmCard as="section" data-testid="card-section">
          Section Content
        </MmCard>
      );
      const card = screen.getByTestId('card-section');
      expect(card.tagName.toLowerCase()).toBe('section');
    });
  });

  describe('MmButton', () => {
    it('renders children and responds to click events', () => {
      const handleClick = vi.fn();
      render(
        <MmButton data-testid="btn-test" onClick={handleClick}>
          Click Me
        </MmButton>
      );
      const button = screen.getByTestId('btn-test');
      expect(button.className).toContain('mm-button');
      expect(button.className).toContain('mm-button--primary');
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('respects disabled state and prevents click handler invocation', () => {
      const handleClick = vi.fn();
      render(
        <MmButton data-testid="btn-disabled" disabled onClick={handleClick}>
          Disabled Action
        </MmButton>
      );
      const button = screen.getByTestId('btn-disabled') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('applies secondary, danger, and ghost variants and sizes', () => {
      render(
        <>
          <MmButton variant="secondary" size="sm" data-testid="btn-sec">
            Secondary
          </MmButton>
          <MmButton variant="danger" size="lg" data-testid="btn-dang">
            Danger
          </MmButton>
          <MmButton variant="ghost" data-testid="btn-gh">
            Ghost
          </MmButton>
        </>
      );
      expect(screen.getByTestId('btn-sec').className).toContain('mm-button--secondary');
      expect(screen.getByTestId('btn-sec').className).toContain('mm-button--sm');
      expect(screen.getByTestId('btn-dang').className).toContain('mm-button--danger');
      expect(screen.getByTestId('btn-dang').className).toContain('mm-button--lg');
      expect(screen.getByTestId('btn-gh').className).toContain('mm-button--ghost');
    });

    it('renders icon with button and passes through aria props', () => {
      render(
        <MmButton
          icon="spark"
          aria-label="Spark action"
          data-testid="btn-icon"
        >
          AI Assist
        </MmButton>
      );
      const button = screen.getByTestId('btn-icon');
      expect(button.getAttribute('aria-label')).toBe('Spark action');
      expect(button.querySelector('svg')).not.toBeNull();
    });
  });

  describe('MmBadge & MmStatusChip', () => {
    it('renders tone classes correctly', () => {
      render(
        <>
          <MmBadge tone="verified" data-testid="b-ver">
            Verified
          </MmBadge>
          <MmBadge tone="review" data-testid="b-rev">
            Review
          </MmBadge>
          <MmBadge tone="in-progress" data-testid="b-prog">
            In Progress
          </MmBadge>
          <MmBadge tone="neutral" data-testid="b-neut">
            Neutral
          </MmBadge>
        </>
      );
      expect(screen.getByTestId('b-ver').className).toContain('mm-badge--verified');
      expect(screen.getByTestId('b-rev').className).toContain('mm-badge--review');
      expect(screen.getByTestId('b-prog').className).toContain('mm-badge--progress');
      expect(screen.getByTestId('b-neut').className).toContain('mm-badge--neutral');
    });

    it('renders dot indicator on MmBadge when dot={true}', () => {
      const { container } = render(
        <MmBadge dot tone="verified" data-testid="badge-dot">
          Active
        </MmBadge>
      );
      const dot = container.querySelector('.mm-badge__dot');
      expect(dot).not.toBeNull();
    });

    it('MmStatusChip defaults to rendering dot and passes through props', () => {
      render(
        <MmStatusChip
          tone="review"
          data-testid="chip-test"
          aria-label="Status: Review"
        >
          Needs Attention
        </MmStatusChip>
      );
      const chip = screen.getByTestId('chip-test');
      expect(chip.getAttribute('aria-label')).toBe('Status: Review');
      expect(chip.className).toContain('mm-badge--review');
      expect(chip.querySelector('.mm-badge__dot')).not.toBeNull();
    });
  });

  describe('MmIcon', () => {
    it('renders glyphs with default size and aria-hidden', () => {
      render(<MmIcon name="shield" data-testid="icon-shield" />);
      const icon = screen.getByTestId('icon-shield');
      expect(icon.getAttribute('width')).toBe('20');
      expect(icon.getAttribute('height')).toBe('20');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('class')).toContain('mm-icon');
    });

    it('allows overriding size, className and aria-label', () => {
      render(
        <MmIcon
          name="mic"
          size={24}
          className="custom-mic-class"
          aria-label="Microphone active"
          data-testid="icon-mic"
        />
      );
      const icon = screen.getByTestId('icon-mic');
      expect(icon.getAttribute('width')).toBe('24');
      expect(icon.getAttribute('height')).toBe('24');
      expect(icon.getAttribute('aria-label')).toBe('Microphone active');
      expect(icon.getAttribute('aria-hidden')).toBeNull();
    });

    it('renders all 22 named glyphs without errors', () => {
      const names = [
        'home',
        'spark',
        'file',
        'users',
        'shield',
        'help',
        'mic',
        'upload',
        'arrow',
        'check',
        'clock',
        'heart',
        'bell',
        'search',
        'chevron',
        'calendar',
        'pill',
        'flask',
        'alert',
        'timeline',
        'language',
        'logout',
      ] as const;

      const { container } = render(
        <div>
          {names.map((name) => (
            <MmIcon key={name} name={name} data-testid={`icon-${name}`} />
          ))}
        </div>
      );

      names.forEach((name) => {
        expect(screen.getByTestId(`icon-${name}`)).toBeDefined();
      });
      expect(container.querySelectorAll('svg').length).toBe(22);
    });
  });
});
