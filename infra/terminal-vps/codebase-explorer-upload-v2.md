# Codebase Explorer Upload V2 deployment input

Sulandra Codebase Explorer uploads use `scripts/install-codebase-explorer-file-management.mjs` in both the terminal gateway and the terminal execution plane.

This release marker ensures the VPS execution stack is rebuilt for the upload-v2 backend introduced with PR #413. The runtime uses authenticated, binary-safe chunked uploads and writes only inside the active `/projects/<project>` tree after validation and finalization.
