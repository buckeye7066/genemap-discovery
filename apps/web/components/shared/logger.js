// Lightweight client-side logger. Production builds should not log raw
// payloads; we deliberately never serialise objects beyond a shallow
// representation, and we never log medical/genomic data even in dev.
//
// Centralising console use lets us swap in a real telemetry backend later
// without touching every call-site.
const isProd = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD) === true;

function safeMsg(msg) {
  if (typeof msg === 'string') return msg;
  try {
    return JSON.stringify(msg);
  } catch {
    return String(msg);
  }
}

export const log = {
  info(msg, ...rest) {
    if (isProd) return;
    console.info(`[info] ${safeMsg(msg)}`, ...rest);
  },
  warn(msg, ...rest) {
    console.warn(`[warn] ${safeMsg(msg)}`, ...rest);
  },
  error(msg, ...rest) {
    console.error(`[error] ${safeMsg(msg)}`, ...rest);
  },
  debug(msg, ...rest) {
    if (isProd) return;
    console.debug(`[debug] ${safeMsg(msg)}`, ...rest);
  },
};

export default log;
