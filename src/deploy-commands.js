// Manual registration: npm run deploy
// (The bot also does this automatically on startup unless REGISTER_COMMANDS=false.)
import './env.js';
import { registerWithDiscord } from './register.js';

try {
  await registerWithDiscord();
} catch (err) {
  console.error('Failed to register with Discord:', err.message ?? err);
  process.exit(1);
}
