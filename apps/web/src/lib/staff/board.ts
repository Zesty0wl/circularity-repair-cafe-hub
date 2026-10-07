// =============================================================================
//  The live board's data
//  ---------------------------------------------------------------------------
//  The board is drawn in two places from two sources:
//
//    /admin/board         an admin, signed in, from /api/admin/board. Full
//                         detail: visitors' names, photos, links to each repair.
//    /display/<token>     the waiting-room screen, from /api/display/<token>.
//                         Nothing personal, because the whole room can read it.
//
//  Both are turned into one shape here, so LiveBoard.svelte draws one thing.
// =============================================================================
import type { RepairStatus } from './queue';

export interface BoardJob {
  /** Only from the admin source, to link to the repair. */
  id?: string;
  jobNumber: string;
  item: string;
  /** Only from the admin source. */
  customerName?: string | null;
  /** Only from the admin source. */
  thumbnailUrl?: string | null;
  category: string | null;
  categoryColour: string | null;
  status: RepairStatus;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  /** The full name for admins, the first name on the waiting-room screen. */
  repairerName: string | null;
}

export interface BoardSession {
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  status: string;
  qrCodeUrl: string | null;
}

export interface BoardData {
  cafeName: string;
  logoUrl: string | null;
  sessions: BoardSession[];
  jobs: BoardJob[];
  today: {
    checkedIn: number;
    fixed: number;
    co2SavedKg: number | null;
    averageRepairMinutes: number | null;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function fromAdminBoard(body: any, cafe: { name?: string | null; logoUrl?: string | null } | null): BoardData {
  return {
    cafeName: cafe?.name || 'Repair Café',
    logoUrl: cafe?.logoUrl ?? null,
    sessions: (body.events ?? []).map((e: any) => ({
      name: e.name,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
      status: e.status,
      qrCodeUrl: e.qrCodeUrl ?? null,
    })),
    jobs: (body.jobs ?? []).map((j: any) => ({
      id: j.id,
      jobNumber: j.jobNumber,
      item: j.itemDescription,
      customerName: j.customerName,
      thumbnailUrl: j.thumbnailUrl,
      category: j.category,
      categoryColour: j.categoryColour,
      status: j.status,
      createdAt: j.createdAt,
      acceptedAt: j.acceptedAt,
      completedAt: j.completedAt,
      repairerName: j.repairerName,
    })),
    today: body.today ?? { checkedIn: 0, fixed: 0, co2SavedKg: null, averageRepairMinutes: null },
  };
}

export function fromDisplay(body: any): BoardData {
  return {
    cafeName: body.cafe?.name || 'Repair Café',
    logoUrl: body.cafe?.logoUrl ?? null,
    sessions: body.sessions ?? [],
    jobs: (body.jobs ?? []).map((j: any) => ({
      jobNumber: j.jobNumber,
      item: j.item,
      category: j.category,
      categoryColour: j.categoryColour,
      status: j.status,
      createdAt: j.createdAt,
      acceptedAt: j.acceptedAt,
      completedAt: j.completedAt,
      repairerName: j.repairerFirstName,
    })),
    today: body.today ?? { checkedIn: 0, fixed: 0, co2SavedKg: null, averageRepairMinutes: null },
  };
}

/** The session whose QR code to show: a running one first. */
export function qrSession(data: BoardData | null): BoardSession | null {
  if (!data) return null;
  return data.sessions.find((s) => s.status === 'active' && s.qrCodeUrl) ?? data.sessions.find((s) => s.qrCodeUrl) ?? null;
}
