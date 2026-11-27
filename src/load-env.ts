import dotenv from 'dotenv';

/**
 * Load .env and let it win over variables already set in the OS environment.
 * A stale system-wide ANTHROPIC_API_KEY (e.g. from an old install) would otherwise
 * silently shadow the key written in .env.
 */
dotenv.config({ override: true });
