import { env, validateStartupConfig } from './config/env.js';
import { connectDB } from './config/database.js';
import { localAuthService } from './services/localAuth.service.js';
import { telegramClient } from './telegram/telegram.client.js';
import { telegramSyncService } from './telegram/telegram.sync.js';
import app from './app.js';

async function startServer() {
  console.log('[BACKEND] Starting KKV Gold Finance backend');

  // 1. Startup validation (non-blocking notice)
  const validation = validateStartupConfig();
  if (!validation.isValid) {
    console.warn(`[Startup Validation] ⚠️ Notice: Missing environment variables: ${validation.missingVars.join(', ')}`);
    console.warn('[BACKEND] Backend will run with local fallback until storage credentials are fully provided.');
  }

  // 2. Synchronous local user seeding to disk cache (instant, zero network latency)
  try {
    await localAuthService.seedDefaultUsers();
    console.log('[BACKEND] Local RBAC accounts verified.');
  } catch (seedErr: any) {
    console.warn('[Startup Seed] User seeding notice:', seedErr?.message || seedErr);
  }

  // 3. Start and bind Express server IMMEDIATELY so /health responds in < 1ms
  const host = process.env.HOST || '127.0.0.1';
  console.log(`[BACKEND] Binding to ${host}:${env.PORT}`);

  const server = app.listen(env.PORT, host, () => {
    console.log('==================================================');
    console.log('[BACKEND] HTTP server started');
    console.log(`[BACKEND] Environment: ${env.NODE_ENV}`);
    console.log(`[BACKEND] Listening on: http://${host}:${env.PORT}`);
    console.log(`[BACKEND] API Base: http://${host}:${env.PORT}/api`);
    console.log(`[BACKEND] Health check available on http://${host}:${env.PORT}/health`);
    console.log('[BACKEND] READY');
    console.log('==================================================');

    // 4. Asynchronously initialize Telegram background storage and sync
    // This runs completely in background and NEVER blocks backend readiness or /health
    connectDB().catch((err) => {
      console.warn('[Storage] Telegram background initialization notice:', err?.message || err);
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ [Server Error] Port ${env.PORT} is already in use by another process.`);
      console.error(`Please close the process using port ${env.PORT} or configure a different PORT.`);
    } else {
      console.error('❌ [Server Error] Server error:', err.message || err);
    }
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('[BACKEND] Gracefully shutting down local backend...');
    telegramClient.stopBackgroundHealthMonitor();
    telegramSyncService.stopPeriodicSync();
    server.close(() => {
      console.log('[BACKEND] HTTP server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((fatalErr) => {
  console.error('❌ [Startup Fatal Error]:', fatalErr?.message || fatalErr);
});
