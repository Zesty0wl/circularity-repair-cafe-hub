export type UserRole = 'super_admin' | 'admin' | 'repairer';

export type RepairStatus = 'waiting' | 'in_progress' | 'completed' | 'cannot_repair' | 'returned';

export type EventStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export type ImageStage = 'check_in' | 'during_repair' | 'completed';

export interface PublicCafe {
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  address: string | null;
  socialLinks: Record<string, string>;
  primaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
}

export interface PublicEvent {
  id: string;
  name: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: EventStatus;
  venue: {
    name: string;
    address: string | null;
    postcode: string | null;
  };
}

export interface PublicSkillCategory {
  id: string;
  name: string;
  icon: string;
  colour: string;
  repairerCount: number;
}

export interface PublicRepairer {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  skills: string[];
  joinDate: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
}
