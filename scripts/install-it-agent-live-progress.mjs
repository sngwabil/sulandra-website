// Stable entrypoint used by API build scripts. The implementation lives in v2 so
// older deployment commands can keep invoking this canonical file name.
await import('./install-it-agent-live-progress-v2.mjs');
await import('./fix-it-agent-progress-bigint.mjs');
await import('./install-it-agent-readable-work-narrative.mjs');
await import('./verify-it-agent-progress-bigint.mjs');
await import('./verify-it-agent-readable-work-narrative.mjs');
