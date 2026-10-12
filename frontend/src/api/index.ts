import { USE_AI, USE_MOCK } from './client';
import { hybridApi } from './hybrid';
import { mockApi } from './mock';
import { realApi } from './real';
import type { Api } from './types';

/** Flip VITE_USE_MOCK to switch between the in-browser mock and the real backend (VITE_USE_AI: mock + real AI). */
export const api: Api = USE_MOCK ? (USE_AI ? hybridApi : mockApi) : realApi;
export { ApiError, USE_AI, USE_MOCK } from './client';
export type { Api } from './types';
