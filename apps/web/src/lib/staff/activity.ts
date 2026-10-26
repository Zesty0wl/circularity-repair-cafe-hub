// =============================================================================
//  The admin dashboard's "recent activity", in plain English
//  ---------------------------------------------------------------------------
//  Each audit log row becomes "who did what", with a link to the repair or
//  event it was about where there is one.
// =============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tNow } from '$lib/i18n';

// Turn an audit log row into "who did what" in plain English. The name is
// returned separately so the template can show it in bold.
export function describeActivity(a: any): { who: string | null; rest: string } {
  const who =
    a.actorName ??
    (a.actorType === 'customer' ? tNow('A visitor') : a.actorType === 'system' ? tNow('The system') : tNow('Someone'));
  const item = a.itemDescription
    ? `${a.itemDescription} (#${a.jobNumber})`
    : a.metadata?.jobNumber
      ? tNow('repair #{number}', { number: a.metadata.jobNumber })
      : tNow('a repair');
  const ev = a.eventName ? tNow('"{name}"', { name: a.eventName }) : tNow('an event');
  const person = a.targetUserName ?? tNow('a team member');
  switch (a.action) {
    case 'checkin.created': return { who, rest: tNow('checked in {item}', { item }) };
    case 'checkin.assisted': return { who, rest: tNow('checked in {item} for a visitor', { item }) };
    case 'repair.accepted': return { who, rest: tNow('started work on {item}', { item }) };
    case 'repair.taken_over': return { who, rest: tNow('took over {item}', { item }) };
    case 'repair.released': return { who, rest: tNow('put {item} back in the queue', { item }) };
    case 'repair.completed': return { who, rest: tNow('fixed {item}', { item }) };
    case 'repair.cannot_repair': return { who, rest: tNow('could not fix {item}', { item }) };
    case 'repair.awaiting_return': return { who, rest: tNow('paused {item} until the visitor brings a part', { item }) };
    case 'display.link_replaced': return { who, rest: tNow('replaced the waiting-room screen link') };
    case 'repair.admin_updated': return { who, rest: tNow('updated {item}', { item }) };
    case 'repair.deleted': return { who, rest: tNow('deleted {item}', { item }) };
    case 'repair.pii_purged': return { who: null, rest: tNow('Personal details were removed from {item}', { item }) };
    case 'repair.pat_recorded': return { who, rest: tNow('recorded a PAT test for {item}', { item }) };
    case 'repair.electrical_changed': return { who, rest: tNow('changed whether {item} needs a PAT test', { item }) };
    case 'preregistration.created': return { who, rest: tNow('pre-registered an item') };
    case 'preregistration.claimed': return { who, rest: tNow('took a pre-registered item to look into') };
    case 'preregistration.taken_over': return { who, rest: tNow('took over a pre-registered item') };
    case 'preregistration.released': return { who, rest: tNow('gave back a pre-registered item') };
    case 'preregistration.checked_in': return { who, rest: tNow('checked in a pre-registered item as repair #{number}', { number: a.metadata?.jobNumber ?? '' }) };
    case 'preregistration.cancelled': return { who, rest: tNow('cancelled a pre-registered item') };
    case 'preregistration.electrical_changed': return { who, rest: tNow('changed whether a pre-registered item needs a PAT test') };
    case 'event.created': return { who, rest: tNow('created the event {event}', { event: ev }) };
    case 'event.updated': return { who, rest: tNow('updated the event {event}', { event: ev }) };
    case 'event.activated': return { who, rest: tNow('started the event {event}', { event: ev }) };
    case 'event.completed': return { who, rest: tNow('ended the event {event}', { event: ev }) };
    case 'event.cancelled': return { who, rest: tNow('cancelled the event {event}', { event: ev }) };
    case 'user.created': return { who, rest: tNow('added {person} to the team', { person }) };
    case 'user.updated': return { who, rest: tNow('updated the profile of {person}', { person }) };
    case 'user.reset_link_generated': return { who, rest: tNow('created a password reset link for {person}', { person }) };
    case 'user.self_updated': return { who, rest: tNow('updated their profile') };
    case 'user.avatar_updated': return { who, rest: tNow('updated the photo of {person}', { person }) };
    case 'user.avatar_removed': return { who, rest: tNow('removed the photo of {person}', { person }) };
    case 'user.avatar_self_updated': return { who, rest: tNow('updated their photo') };
    case 'user.avatar_self_removed': return { who, rest: tNow('removed their photo') };
    case 'auth.password_reset': return { who, rest: tNow('reset their password') };
    case 'venue.created': return { who, rest: tNow('added a venue') };
    case 'venue.updated': return { who, rest: tNow('updated a venue') };
    case 'template.created': return { who, rest: tNow('created an event template') };
    case 'skill_category.created': return { who, rest: tNow('added a skill category') };
    case 'backup.downloaded': return { who, rest: tNow('downloaded a backup') };
    case 'backup.restored': return { who, rest: tNow('restored a backup') };
    case 'setup.completed': return { who: null, rest: tNow('Setup was completed') };
    case 'co2.backfilled': return { who: null, rest: tNow('Older repairs were given their item type, so they count towards the CO₂ total') };
    case 'event.photo_added': return { who, rest: tNow('added a photo of a session') };
    case 'event.photo_deleted': return { who, rest: tNow('removed a session photo') };
    case 'event.repair_photos_published': return { who, rest: tNow('showed repair photos on the public site') };
    case 'event.repair_photos_hidden': return { who, rest: tNow('hid repair photos from the public site') };
    default: {
      if (a.action?.startsWith('event.photo') || a.action?.startsWith('event.repair_photo')) {
        return { who, rest: tNow('updated the photos for a session') };
      }
      if (a.action?.startsWith('cafe.gallery')) return { who, rest: tNow('updated the photo gallery') };
      if (a.action?.startsWith('cafe.')) return { who, rest: tNow('updated the cafe settings') };
      return { who, rest: tNow('updated {thing}', { thing: String(a.entityType).replace(/_/g, ' ') }) };
    }
  }
}

export function activityLink(a: any): string | null {
  if (a.entityType === 'repair_job' && a.entityId && a.itemDescription) return `/admin/repairs/${a.entityId}`;
  if (a.entityType === 'event' && a.entityId && a.eventName) return `/admin/events/${a.entityId}`;
  return null;
}
