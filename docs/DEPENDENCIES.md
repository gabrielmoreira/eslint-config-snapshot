# Dependencies

- `@manypkg/get-packages`: Required by SPEC.md for workspace discovery in `discover` mode.
- `cosmiconfig`: Required by SPEC_ENHANCED.md for staged configuration discovery with ordered search places.
- `fast-glob`: Deterministic cross-platform globbing for sampling files and loading snapshot files.
- `picomatch`: Glob matching engine for ordered group assignment with negative patterns (`!`).
- `@types/picomatch`: Type declarations for strict TypeScript typecheck in NodeNext builds.
- `tsup`: Esbuild-based package builds for fast deterministic JavaScript output.
- `tsx`: Run the TypeScript CLI directly from source during local development (no stale dist artifacts).
- `vitest`: Test runner required by SPEC.md.
