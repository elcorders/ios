import { cleanup } from './helpers/admin';

export default async function globalSetup(): Promise<void> {
  await cleanup();
}
