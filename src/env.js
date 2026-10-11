// Loads .env, then fills in values that hosting platforms provide automatically.
// Import this first, before any other module of the bot.
import 'dotenv/config';

const env = process.env;

// Railway: public domain is a bare hostname ("name.up.railway.app"); a volume exposes its mount path.
if (!env.PUBLIC_URL && env.RAILWAY_PUBLIC_DOMAIN) env.PUBLIC_URL = `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
if (!env.DATA_DIR && env.RAILWAY_VOLUME_MOUNT_PATH) env.DATA_DIR = env.RAILWAY_VOLUME_MOUNT_PATH;
// Render: external URL includes the scheme.
if (!env.PUBLIC_URL && env.RENDER_EXTERNAL_URL) env.PUBLIC_URL = env.RENDER_EXTERNAL_URL;

if (env.PUBLIC_URL) env.PUBLIC_URL = env.PUBLIC_URL.replace(/\/+$/, '');

const onRailway = Boolean(env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_PROJECT_ID);
if (onRailway && !env.RAILWAY_VOLUME_MOUNT_PATH && !env.DATA_DIR) {
  console.warn(
    '⚠️  No Railway volume attached — records and settings will be WIPED on every deploy. ' +
      'Add a volume mounted at /data (see README → Deploy on Railway).',
  );
}
