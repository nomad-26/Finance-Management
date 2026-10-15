import app from '../backend/src/app.js';
import { ensureStorageConnected } from '../backend/src/config/database.js';
import { localAuthService } from '../backend/src/services/localAuth.service.js';

// Guarantee Master Admin user is loaded in memory on serverless cold start
try {
  localAuthService.ensureDefaultUsers();
} catch (authErr: any) {
  console.warn('[Vercel Serverless] Auth warmup notice:', authErr?.message || authErr);
}

// Warm up storage connection on serverless cold start
ensureStorageConnected().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.warn('[Vercel Serverless] Cloud Firestore storage warmup notice:', message);
});

export default app;
