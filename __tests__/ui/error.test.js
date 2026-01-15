/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';
import { showError } from '../../src/ui/error.js';

describe('showError', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('appends an error notification with the provided message', () => {
    showError('Something went wrong');
    const errorDiv = document.body.lastElementChild;
    expect(errorDiv).not.toBeNull();
    // Check header
    expect(errorDiv.innerHTML).toContain('❌ Error Occurred');
    // Check message text
    expect(errorDiv.innerHTML).toContain('Error: Something went wrong');
  });

  it('automatically removes the notification after 7 seconds', () => {
    showError('Timeout test');
    expect(document.body.children.length).toBe(1);

    // Fast–forward timers
    jest.advanceTimersByTime(7000);
    // Should be removed
    expect(document.body.children.length).toBe(0);
  });
});