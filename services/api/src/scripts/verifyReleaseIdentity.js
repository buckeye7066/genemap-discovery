import { resolveRailwayReleaseSha } from '../config/releaseIdentity.js';

// This process must run before any production migration. It deliberately emits
// no deployment metadata; success is the zero exit status, and invalid or
// missing provider identity throws before the database can be touched.
resolveRailwayReleaseSha(process.env, { production: true });
