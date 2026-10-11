import { USE_MOCK } from './client';
import { mockApi } from './mock';
import { realApi } from './real';
import type { Api } from './types';

/** Flip VITE_USE_MOCK to switch between the in-browser mock and the real backend. */
export const api: Api = USE_MOCK ? mockApi : realApi;
export { ApiError, USE_MOCK } from './client';
export type { Api } from './types';
