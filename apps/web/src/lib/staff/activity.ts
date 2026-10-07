// =============================================================================
//  The admin dashboard's "recent activity", in plain English
//  ---------------------------------------------------------------------------
//  Each audit log row becomes "who did what", with a link to the repair or
//  event it was about where there is one.
// =============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

// Turn an audit log row into "who did what" in plain English. The name is
// returned separately so the template can show it in bold.
export function describeActivity(a: any): { who: string | null; rest: string } {
  const who =
    a.actorName ??
    (a.actorType === 'customer' ? 'A visitor' : a.actorType === 'system' ? 'The system' : 'Someone');
  const item = a.itemDescription
    ? `${a.itemDescription} (#${a.jobNumber})`
    : a.metadata?.jobNumber
      ? `repair #${a.metadata.jobNumber}`
      : 'a repair';
  const ev = a.eventName ? `"${a.eventName}"` : 'an event';
  const person = a.targetUserName ?? 'a team member';
  switch (a.action) {
    case 'checkin.created': return { who, rest: `checked in ${item}` };
    case 'checkin.assisted': return { who, rest: `checked in ${item} for a visitor` };
    case 'repair.accepted': return { who, rest: `started work on ${item}` };
    case 'repair.taken_over': return { who, rest: `took over ${item}` };
    case 'repair.released': return { who, rest: `put ${item} back in the queue` };
    case 'repair.completed': return { who, rest: `fixed ${item}` };
    case 'repair.cannot_repair': return { who, rest: `could not fix ${item}` };
    case 'repair.awaiting_return': return { who, rest: `paused ${item} until the visitor brings a part` };
    case 'display.link_replaced': return { who, rest: 'replaced the waiting-room screen link' };
    case 'repair.admin_updated': return { who, rest: `updated ${item}` };
    case 'repair.deleted': return { who, rest: `deleted ${item}` };
    case 'repair.pii_purged': return { who: null, rest: `Personal details were removed from ${item}` };
    case 'event.created': return { who, rest: `created the event ${ev}` };
    case 'event.updated': return { who, rest: `updated the event ${ev}` };
    case 'event.activated': return { who, rest: `started the event ${ev}` };
    case 'event.completed': return { who, rest: `ended the event ${ev}` };
    case 'event.cancelled': return { who, rest: `cancelled the event ${ev}` };
    case 'user.created': return { who, rest: `added ${person} to the team` };
    case 'user.updated': return { who, rest: `updated the profile of ${person}` };
    case 'user.reset_link_generated': return { who, rest: `created a password reset link for ${person}` };
    case 'user.self_updated': return { who, rest: 'updated their profile' };
    case 'user.avatar_updated': return { who, rest: `updated the photo of ${person}` };
    case 'user.avatar_removed': return { who, rest: `removed the photo of ${person}` };
    case 'user.avatar_self_updated': return { who, rest: 'updated their photo' };
    case 'user.avatar_self_removed': return { who, rest: 'removed their photo' };
    case 'auth.password_reset': return { who, rest: 'reset their password' };
    case 'venue.created': return { who, rest: 'added a venue' };
    case 'venue.updated': return { who, rest: 'updated a venue' };
    case 'template.created': return { who, rest: 'created an event template' };
    case 'skill_category.created': return { who, rest: 'added a skill category' };
    case 'backup.downloaded': return { who, rest: 'downloaded a backup' };
    case 'backup.restored': return { who, rest: 'restored a backup' };
    case 'setup.completed': return { who: null, rest: 'Setup was completed' };
    case 'co2.backfilled': return { who: null, rest: 'Older repairs were given their item type, so they count towards the CO₂ total' };
    case 'event.photo_added': return { who, rest: 'added a photo of a session' };
    case 'event.photo_deleted': return { who, rest: 'removed a session photo' };
    case 'event.repair_photos_published': return { who, rest: 'showed repair photos on the public site' };
    case 'event.repair_photos_hidden': return { who, rest: 'hid repair photos from the public site' };
    default: {
      if (a.action?.startsWith('event.photo') || a.action?.startsWith('event.repair_photo')) {
        return { who, rest: 'updated the photos for a session' };
      }
      if (a.action?.startsWith('cafe.gallery')) return { who, rest: 'updated the photo gallery' };
      if (a.action?.startsWith('cafe.')) return { who, rest: 'updated the cafe settings' };
      return { who, rest: `updated ${String(a.entityType).replace(/_/g, ' ')}` };
    }
  }
}

export function activityLink(a: any): string | null {
  if (a.entityType === 'repair_job' && a.entityId && a.itemDescription) return `/admin/repairs/${a.entityId}`;
  if (a.entityType === 'event' && a.entityId && a.eventName) return `/admin/events/${a.entityId}`;
  return null;
}
