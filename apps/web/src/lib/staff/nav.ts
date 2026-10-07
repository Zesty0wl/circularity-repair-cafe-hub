// =============================================================================
//  Where staff can go
//  ---------------------------------------------------------------------------
//  One menu for everybody who signs in, so nobody gets stranded. Repairers
//  used to have a top bar and admins a sidebar, with different items in each.
//  An admin who opened "My profile" or "Add a repair" landed in the repairer
//  area with no way back to the admin pages, and repairers who followed an
//  admin link were bounced to the sign-in page. People learned to sign out and
//  in again to find their way home.
//
//  Now there is one menu. Everyone sees the session pages. Admins also see the
//  pages for running the cafe. The same menu is on every page, so the way back
//  is always in the same place.
// =============================================================================
import type { ComponentType } from 'svelte';
import {
  BarChart3,
  Calendar,
  Camera,
  ClipboardList,
  History,
  Laptop,
  LayoutDashboard,
  MapPin,
  MonitorPlay,
  Settings,
  Tags,
  UserCircle2,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-svelte';
import type { AuthUser } from '$lib/stores/auth';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType;
  /** Other paths that belong to this item, for showing where you are. */
  also?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function isAdminRole(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

/** The page to land on after signing in, or when you press the cafe's name. */
export function homeFor(user: AuthUser | null | undefined): string {
  return isAdminRole(user) ? '/admin/dashboard' : '/repairer';
}

export function navFor(user: AuthUser | null | undefined, options: { linuxEnabled: boolean }): NavGroup[] {
  const session: NavGroup = {
    title: 'Today’s session',
    items: [
      { href: '/repairer', label: 'Repair queue', icon: ClipboardList, also: ['/repairer/job'] },
      { href: '/repairer/checkin', label: 'Check in a visitor', icon: UserPlus },
      { href: '/repairer/photos', label: 'Session photos', icon: Camera },
    ],
  };
  const mine: NavGroup = {
    title: 'You',
    items: [
      { href: '/repairer/history', label: 'My repairs', icon: History },
      { href: '/repairer/profile', label: 'My profile', icon: UserCircle2 },
    ],
  };
  if (!isAdminRole(user)) return [session, mine];

  session.items.splice(0, 0, { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard });
  session.items.push({ href: '/admin/board', label: 'Live board', icon: MonitorPlay });
  return [
    session,
    {
      title: 'Running the cafe',
      items: [
        { href: '/admin/events', label: 'Events', icon: Calendar },
        { href: '/admin/repairs', label: 'All repairs', icon: Wrench },
        ...(options.linuxEnabled ? [{ href: '/admin/linux', label: 'Linux installs', icon: Laptop }] : []),
        { href: '/admin/repairers', label: 'Volunteers', icon: Users },
        { href: '/admin/stats', label: 'Statistics', icon: BarChart3 },
      ],
    },
    {
      title: 'Setting up',
      items: [
        { href: '/admin/skills', label: 'Skills', icon: Tags },
        { href: '/admin/venues', label: 'Venues', icon: MapPin },
        { href: '/admin/settings', label: 'Settings', icon: Settings },
      ],
    },
    mine,
  ];
}

/** The few places a phone needs one tap away, in a bar at the bottom. */
export function tabsFor(user: AuthUser | null | undefined): NavItem[] {
  const tabs: NavItem[] = [
    { href: '/repairer', label: 'Queue', icon: ClipboardList, also: ['/repairer/job'] },
    { href: '/repairer/checkin', label: 'Check in', icon: UserPlus },
    { href: '/repairer/photos', label: 'Photos', icon: Camera },
  ];
  if (isAdminRole(user)) tabs.unshift({ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard });
  else tabs.push({ href: '/repairer/profile', label: 'Me', icon: UserCircle2 });
  return tabs;
}

/** Whether a menu item is the page you are on, or the section it belongs to. */
export function isCurrent(item: NavItem, pathname: string): boolean {
  const paths = [item.href, ...(item.also ?? [])];
  return paths.some((p) => {
    if (pathname === p) return true;
    // "/repairer" is the queue page itself; its sub-pages have their own items.
    if (p === '/repairer') return false;
    return pathname.startsWith(`${p}/`);
  });
}

/**
 * Where to go after signing in. Only a path on this site, and only one this
 * person may open, so a link cannot send a repairer somewhere they would be
 * turned away from.
 */
export function safeNext(next: string | null | undefined, user: AuthUser): string {
  const home = homeFor(user);
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return home;
  if (next.startsWith('/admin') && !isAdminRole(user)) return home;
  return next;
}
