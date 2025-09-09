import { formatDate } from '../src/utils/format.js';

describe('formatDate', () => {
    it('formats valid ISO date-time string', () => {
        const result = formatDate('2023-01-01T12:00:00Z');
        expect(typeof result).toBe('string');
        expect(result).not.toBe('Unknown');
        expect(result).not.toBe('Invalid Date');
    });

    it('formats date-only string', () => {
        const input = '2021-02-14';
        const expected = new Date(input).toLocaleDateString('en-US', {
            month: 'long',
            day:   'numeric',
            year:  'numeric'
        });
        expect(formatDate(input)).toBe(expected);
    });

    it('formats numeric timestamp', () => {
        const ts = 1609459200000;  // Jan 1 2021 UTC
        const expected = new Date(ts).toLocaleDateString('en-US', {
            month: 'long',
            day:   'numeric',
            year:  'numeric'
        });
        expect(formatDate(ts)).toBe(expected);
    });

    it('returns "Invalid Date" for unparsable string', () => {
        expect(formatDate('not-a-date')).toBe('Invalid Date');
    });

    it('returns Unknown for undefined input', () => {
        expect(formatDate()).toBe('Unknown');
    });

    it('returns Unknown for empty string', () => {
        expect(formatDate('')).toBe('Unknown');
    });

    it('returns Unknown for null input', () => {
        expect(formatDate(null)).toBe('Unknown');
    });

    it('returns the original value if toString() throws', () => {
        const bad = { toString: () => { throw new Error('fail'); } };
        expect(formatDate(bad)).toBe(bad);
    });
});