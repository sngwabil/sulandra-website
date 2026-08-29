// Stable entrypoint used by API build scripts. The implementation lives in v2 so
// older deployment commands can keep invoking this canonical file name.
await import('./install-it-agent-live-progress-v2.mjs');
