#!/usr/bin/env node

import { stopOwnedEvaRuntime } from './start-eva-api.mjs';

try {
  const stopped = stopOwnedEvaRuntime();
  console.log(stopped ? '[eva] stopped owned disposable PostgreSQL cluster' : '[eva] no owned PostgreSQL cluster was running');
} catch (error) {
  console.error(`[eva] ${error.message}`);
  process.exitCode = 1;
}
