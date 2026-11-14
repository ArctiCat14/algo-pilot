import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');
export const DATA_DIR = process.env.ALGO_DATA_DIR
  ? resolve(process.env.ALGO_DATA_DIR)
  : resolve(PROJECT_ROOT, 'data');
export const DB_PATH = process.env.ALGO_DB_PATH
  ? resolve(process.env.ALGO_DB_PATH)
  : resolve(DATA_DIR, 'algo-training.db');
export const WEB_DIST = resolve(PROJECT_ROOT, 'apps/web/dist');
export const PORT = Number(process.env.PORT ?? 4317);
export const HOST = process.env.HOST ?? '127.0.0.1';

mkdirSync(DATA_DIR, { recursive: true });
