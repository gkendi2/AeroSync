import { describe, expect, it } from '@jest/globals';

import {
  checkMessageText,
  desiredMemberships,
  MAX_MESSAGE_LENGTH,
  memberKeyFor,
  sameMemberKey,
  updateAssignmentIds,
} from '../membership';

const flights = [
  { id: 'f-16', flightNumber: 'KQ901', departureDate: '2026-11-16', departureTime: '14:00' },
  { id: 'f-17', flightNumber: 'KQ 901', departureDate: '2026-11-17', departureTime: '14:00' },
  { id: 'g-16', flightNumber: 'KQ902', departureDate: '2026-11-16', departureTime: '16:00' },
];

function assignment(overrides: Partial<{ id: string; handlerUid: string; flightNumber: string; shiftDate: string; status: string }> = {}) {
  return {
    id: 'a1',
    handlerUid: 'h1',
    flightNumber: 'kq-901',
    shiftDate: '2026-11-16',
    status: 'Assigned',
    ...overrides,
  };
}

describe('memberKeyFor', () => {
  it('maps an assignment to the Flights document with the same number and date', () => {
    expect(memberKeyFor(assignment(), flights)).toEqual({ flightId: 'f-16', handlerUid: 'h1' });
    expect(memberKeyFor(assignment({ shiftDate: '2026-11-17' }), flights)?.flightId).toBe('f-17');
  });

  it('keeps Completed assignments and drops Cancelled ones', () => {
    expect(memberKeyFor(assignment({ status: 'Completed' }), flights)).not.toBeNull();
    expect(memberKeyFor(assignment({ status: 'Cancelled' }), flights)).toBeNull();
  });

  it('is null without a matching flight or handler', () => {
    expect(memberKeyFor(assignment({ shiftDate: '2026-11-20' }), flights)).toBeNull();
    expect(memberKeyFor(assignment({ handlerUid: '' }), flights)).toBeNull();
  });
});

describe('sameMemberKey and updateAssignmentIds', () => {
  it('compares flight and handler', () => {
    const key = { flightId: 'f-16', handlerUid: 'h1' };
    expect(sameMemberKey(key, { ...key })).toBe(true);
    expect(sameMemberKey(key, { ...key, handlerUid: 'h2' })).toBe(false);
    expect(sameMemberKey(key, null)).toBe(false);
  });

  it('adds without duplicates and removes', () => {
    expect(updateAssignmentIds(['a1'], 'a2', 'add')).toEqual(['a1', 'a2']);
    expect(updateAssignmentIds(['a1', 'a2'], 'a1', 'add')).toEqual(['a2', 'a1']);
    expect(updateAssignmentIds(['a1', 'a2'], 'a1', 'remove')).toEqual(['a2']);
    expect(updateAssignmentIds([], 'a1', 'remove')).toEqual([]);
  });
});

describe('desiredMemberships', () => {
  it('groups non-cancelled assignments per flight and handler', () => {
    const result = desiredMemberships(
      [
        assignment({ id: 'a1' }),
        assignment({ id: 'a2', status: 'Completed' }),
        assignment({ id: 'a3', status: 'Cancelled' }),
        assignment({ id: 'a4', flightNumber: 'KQ902' }),
        assignment({ id: 'a5', handlerUid: 'h2' }),
        assignment({ id: 'a6', handlerUid: 'not-a-handler' }),
        assignment({ id: 'a7', shiftDate: '2026-11-30' }),
      ],
      flights,
      new Set(['h1', 'h2']),
    );

    expect([...result.keys()].sort()).toEqual(['f-16/h1', 'f-16/h2', 'g-16/h1']);
    expect(result.get('f-16/h1')?.assignmentIds).toEqual(['a1', 'a2']);
  });
});

describe('checkMessageText', () => {
  it('trims, rejects empty and over-long text', () => {
    expect(checkMessageText('  Gate change  ')).toEqual({ ok: true, text: 'Gate change' });
    expect(checkMessageText('   ').ok).toBe(false);
    expect(checkMessageText('x'.repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
    expect(checkMessageText('x'.repeat(MAX_MESSAGE_LENGTH + 1)).ok).toBe(false);
  });
});
