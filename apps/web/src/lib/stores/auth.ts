import { writable } from 'svelte/store';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'repairer';
  avatarUrl: string | null;
}

export interface AuthState {
  accessToken: string;
  user: AuthUser;
}

export const auth = writable<AuthState | null>(null);

export function isAdmin(state: AuthState | null): boolean {
  return state?.user.role === 'admin' || state?.user.role === 'super_admin';
}
