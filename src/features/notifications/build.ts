/**
 * In-app notifications, derived from live Firestore data. Pure functions, unit-tested.
 *
 *   Window  only events from the last 7 days are listed.
 *   Unread  the event time is after the user's lastSeenAt (everything is unread
 *           before the first visit). A High-risk flight has no event time: it is
 *           unread when this device did not see it as High at the last visit.
 *   Own     the user's own messages and reports never notify them.
 */

export const NOTIFICATION_WINDOW_DAYS = 7;
const WINDOW_MS = NOTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type NotificationKind =
  | 'assignment'
  | 'incident-status'
  | 'corrective-action'
  | 'message'
  | 'new-incident'
  | 'high-risk';

export type NotificationTarget =
  | { pathname: '/explore' | '/incidents' | '/incident-management' }
  | { pathname: '/flight-thread'; params: { flightId: string } }
  | { pathname: '/delay-risk'; params: { flightId: string } };

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Null for High-risk alerts, which describe the present. */
  time: Date | null;
  unread: boolean;
  target: NotificationTarget;
};

export type NotifyAssignment = {
  id: string;
  flightNumber: string;
  activity: string;
  shiftDate: string;
  shiftTime: string;
  status: string;
  createdAt: Date | null;
};

export type NotifyIncident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  reportedBy: string;
  reportedAt: Date | null;
  statusUpdatedAt: Date | null;
  supervisorNotes: string;
  supervisorNotesUpdatedAt: Date | null;
};

export type NotifyMessage = {
  id: string;
  flightId: string;
  flightNumber: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: Date | null;
};

export type NotifyHighRiskFlight = {
  id: string;
  flightNumber: string;
  departureDate: string;
  departureTime: string;
};

function inWindow(time: Date | null, now: Date) {
  return !!time && now.getTime() - time.getTime() <= WINDOW_MS;
}

function isUnread(time: Date | null, lastSeen: Date | null) {
  return !!time && (!lastSeen || time.getTime() > lastSeen.getTime());
}

function displayStatus(status: string) {
  return status === 'Under Review' || status === 'Under Investigation' ? 'In Review' : status;
}

function preview(text: string, max = 90) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function messageNotification(message: NotifyMessage, lastSeen: Date | null): AppNotification {
  const role = message.senderRole === 'supervisor' ? 'Supervisor' : 'Handler';

  return {
    id: `message:${message.flightId}:${message.id}`,
    kind: 'message',
    title: `Message on ${message.flightNumber}`,
    body: `${message.senderName} (${role}): ${preview(message.text)}`,
    time: message.createdAt,
    unread: isUnread(message.createdAt, lastSeen),
    target: { pathname: '/flight-thread', params: { flightId: message.flightId } },
  };
}

/** Newest first; High-risk alerts (no time) on top. */
function sortNotifications(list: AppNotification[]) {
  return list.sort((a, b) => (b.time?.getTime() ?? Infinity) - (a.time?.getTime() ?? Infinity));
}

export function buildHandlerNotifications({
  uid,
  assignments,
  incidents,
  messages,
  lastSeen,
  now,
}: {
  uid: string;
  assignments: NotifyAssignment[];
  incidents: NotifyIncident[];
  messages: NotifyMessage[];
  lastSeen: Date | null;
  now: Date;
}): AppNotification[] {
  const list: AppNotification[] = [];

  for (const assignment of assignments) {
    if (assignment.status === 'Cancelled' || !inWindow(assignment.createdAt, now)) continue;

    list.push({
      id: `assignment:${assignment.id}`,
      kind: 'assignment',
      title: `New task: ${assignment.flightNumber || 'General task'}`,
      body: `${assignment.activity || 'General handling'} · ${assignment.shiftDate} ${assignment.shiftTime}`.trim(),
      time: assignment.createdAt,
      unread: isUnread(assignment.createdAt, lastSeen),
      target: { pathname: '/explore' },
    });
  }

  for (const incident of incidents) {
    if (incident.reportedBy !== uid) continue;

    if (inWindow(incident.statusUpdatedAt, now)) {
      list.push({
        id: `incident-status:${incident.id}:${incident.statusUpdatedAt!.getTime()}`,
        kind: 'incident-status',
        title: `Report update: ${incident.title}`,
        body: `Status is now ${displayStatus(incident.status)}.`,
        time: incident.statusUpdatedAt,
        unread: isUnread(incident.statusUpdatedAt, lastSeen),
        target: { pathname: '/incidents' },
      });
    }

    if (incident.supervisorNotes.trim() && inWindow(incident.supervisorNotesUpdatedAt, now)) {
      list.push({
        id: `corrective-action:${incident.id}:${incident.supervisorNotesUpdatedAt!.getTime()}`,
        kind: 'corrective-action',
        title: `Corrective action: ${incident.title}`,
        body: preview(incident.supervisorNotes),
        time: incident.supervisorNotesUpdatedAt,
        unread: isUnread(incident.supervisorNotesUpdatedAt, lastSeen),
        target: { pathname: '/incidents' },
      });
    }
  }

  for (const message of messages) {
    if (message.senderUid === uid || !inWindow(message.createdAt, now)) continue;
    list.push(messageNotification(message, lastSeen));
  }

  return sortNotifications(list);
}

export function buildSupervisorNotifications({
  uid,
  incidents,
  messages,
  highRiskFlights,
  seenHighRiskIds,
  lastSeen,
  now,
}: {
  uid: string;
  incidents: NotifyIncident[];
  messages: NotifyMessage[];
  highRiskFlights: NotifyHighRiskFlight[];
  seenHighRiskIds: Set<string>;
  lastSeen: Date | null;
  now: Date;
}): AppNotification[] {
  const list: AppNotification[] = [];

  for (const flight of highRiskFlights) {
    list.push({
      id: `high-risk:${flight.id}`,
      kind: 'high-risk',
      title: `${flight.flightNumber} is High risk`,
      body: `Departs ${flight.departureDate} ${flight.departureTime}`.trim(),
      time: null,
      unread: !seenHighRiskIds.has(flight.id),
      target: { pathname: '/delay-risk', params: { flightId: flight.id } },
    });
  }

  for (const incident of incidents) {
    if (incident.reportedBy === uid || !inWindow(incident.reportedAt, now)) continue;

    list.push({
      id: `new-incident:${incident.id}`,
      kind: 'new-incident',
      title: `New incident: ${incident.title}`,
      body: `Severity ${incident.severity} · ${displayStatus(incident.status)}`,
      time: incident.reportedAt,
      unread: isUnread(incident.reportedAt, lastSeen),
      target: { pathname: '/incident-management' },
    });
  }

  for (const message of messages) {
    if (message.senderUid === uid || !inWindow(message.createdAt, now)) continue;
    list.push(messageNotification(message, lastSeen));
  }

  return sortNotifications(list);
}

export function unreadCount(list: AppNotification[]) {
  return list.filter((item) => item.unread).length;
}

/** "9+" above nine; empty when nothing is unread. */
export function badgeLabel(count: number) {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}
