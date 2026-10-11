/**
 * Real auth endpoints (Beck's contract). All paths live here so they are easy to change:
 *   POST /auth/register  {email,password} -> {access_token, token_type:"bearer", user}
 *   POST /auth/login     {email,password} -> {access_token, token_type:"bearer", user}
 *   GET  /auth/me        -> {id, email}   (Authorization: Bearer <token>)
 */
import type { AuthResponse, User } from '../types/trip';
import { apiFetch, clearToken, setToken } from './client';

export const AUTH_PATHS = {
  register: '/auth/register',
  login: '/auth/login',
  me: '/auth/me',
} as const;

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>(AUTH_PATHS.register, {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setToken(res.access_token);
  return res;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>(AUTH_PATHS.login, {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setToken(res.access_token);
  return res;
}

export function me(): Promise<User> {
  return apiFetch<User>(AUTH_PATHS.me);
}

export function logout(): void {
  clearToken();
}
