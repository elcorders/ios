import { cleanup } from './helpers/admin';

export default async function globalTeardown(): Promise<void> {
  await cleanup();
}
