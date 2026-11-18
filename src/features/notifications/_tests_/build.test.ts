import { describe, expect, it } from '@jest/globals';

import {
  badgeLabel,
  buildHandlerNotifications,
  buildSupervisorNotifications,
  NotifyIncident,
  NotifyMessage,
  unreadCount,
} from '../build';

const NOW = new Date(2026, 10, 18, 12, 0);
const LAST_SEEN = new Date(2026, 10, 18, 9, 0);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86400000);

function incident(overrides: Partial<NotifyIncident> = {}): NotifyIncident {
  return {
    id: 'i1',
    title: 'Baggage – KQ901',
    severity: 'High',
    status: 'Open',
    reportedBy: 'h1',
    reportedAt: hoursAgo(1),
    statusUpdatedAt: null,
    supervisorNotes: '',
    supervisorNotesUpdatedAt: null,
    ...overrides,
  };
}

function message(overrides: Partial<NotifyMessage> = {}): NotifyMessage {
  return {
    id: 'm1',
    flightId: 'f1',
    flightNumber: 'KQ901',
    senderUid: 's1',
    senderName: 'Amina',
    senderRole: 'supervisor',
    text: 'Gate changed to 14',
    createdAt: hoursAgo(1),
    ...overrides,
  };
}

describe('buildHandlerNotifications', () => {
  const build = (input: Partial<Parameters<typeof buildHandlerNotifications>[0]>) =>
    buildHandlerNotifications({
      uid: 'h1',
      assignments: [],
      incidents: [],
      messages: [],
      lastSeen: LAST_SEEN,
      now: NOW,
      ...input,
    });

  it('lists new assignments in the 7-day window, except cancelled ones', () => {
    const list = build({
      assignments: [
        { id: 'a1', flightNumber: 'KQ901', activity: 'Loading baggage', shiftDate: '2026-11-18', shiftTime: '06:00-14:00', status: 'Assigned', createdAt: hoursAgo(1) },
        { id: 'a2', flightNumber: 'KQ902', activity: 'Loading baggage', shiftDate: '2026-11-18', shiftTime: '06:00-14:00', status: 'Cancelled', createdAt: hoursAgo(1) },
        { id: 'a3', flightNumber: 'KQ903', activity: 'Loading baggage', shiftDate: '2026-11-01', shiftTime: '06:00-14:00', status: 'Assigned', createdAt: daysAgo(8) },
      ],
    });

    expect(list.map((item) => item.id)).toEqual(['assignment:a1']);
    expect(list[0].target).toEqual({ pathname: '/explore' });
  });

  it('notifies status changes and corrective actions on own reports only', () => {
    const list = build({
      incidents: [
        incident({ status: 'Under Review', statusUpdatedAt: hoursAgo(2) }),
        incident({ id: 'i2', supervisorNotes: 'Belt repaired', supervisorNotesUpdatedAt: hoursAgo(1) }),
        incident({ id: 'i3', reportedBy: 'someone-else', statusUpdatedAt: hoursAgo(1) }),
        incident({ id: 'i4', supervisorNotes: '', supervisorNotesUpdatedAt: hoursAgo(1) }),
      ],
    });

    expect(list.map((item) => item.kind)).toEqual(['corrective-action', 'incident-status']);
    expect(list[1].body).toBe('Status is now In Review.');
  });

  it("skips the handler's own messages and marks unread after lastSeen", () => {
    const list = build({
      messages: [
        message({ id: 'new', createdAt: hoursAgo(1) }),
        message({ id: 'old', createdAt: hoursAgo(5) }),
        message({ id: 'mine', senderUid: 'h1' }),
      ],
    });

    expect(list.map((item) => [item.id, item.unread])).toEqual([
      ['message:f1:new', true],
      ['message:f1:old', false],
    ]);
    expect(list[0].target).toEqual({ pathname: '/flight-thread', params: { flightId: 'f1' } });
    expect(unreadCount(list)).toBe(1);
  });

  it('treats everything in the window as unread before the first visit', () => {
    const list = build({ lastSeen: null, messages: [message({ createdAt: daysAgo(6) })] });
    expect(unreadCount(list)).toBe(1);
  });
});

describe('buildSupervisorNotifications', () => {
  it('lists High risk first, then new incidents and messages newest first', () => {
    const list = buildSupervisorNotifications({
      uid: 's1',
      incidents: [incident({ reportedAt: hoursAgo(2.5) }), incident({ id: 'own', reportedBy: 's1' })],
      messages: [message({ senderUid: 'h2', senderRole: 'handler', createdAt: hoursAgo(2) })],
      highRiskFlights: [
        { id: 'f1', flightNumber: 'KQ901', departureDate: '2026-11-18', departureTime: '14:00' },
        { id: 'f2', flightNumber: 'KQ902', departureDate: '2026-11-18', departureTime: '15:00' },
      ],
      seenHighRiskIds: new Set(['f2']),
      lastSeen: LAST_SEEN,
      now: NOW,
    });

    expect(list.map((item) => [item.kind, item.unread])).toEqual([
      ['high-risk', true],
      ['high-risk', false],
      ['message', true],
      ['new-incident', true],
    ]);
    expect(list[0].target).toEqual({ pathname: '/delay-risk', params: { flightId: 'f1' } });
  });
});

describe('badgeLabel', () => {
  it('caps at 9+', () => {
    expect(badgeLabel(0)).toBe('');
    expect(badgeLabel(3)).toBe('3');
    expect(badgeLabel(12)).toBe('9+');
  });
});
