# SPEC_ENHANCED.md

## Purpose

This document is a required staging layer that must always be used together with `SPEC.md`.

It records only explicitly requested approved deviations or enhancements.

## Active Enhancements

### E-001: Cosmiconfig-Based Configuration Discovery

Configuration discovery must use `cosmiconfig` with deterministic ordered `searchPlaces`.

The required ordered list is:

1. `.eslint-config-snapshotter.js`
2. `.eslint-config-snapshotter.cjs`
3. `.eslint-config-snapshotter.mjs`
4. `eslint-config-snapshotter.config.js`
5. `eslint-config-snapshotter.config.cjs`
6. `eslint-config-snapshotter.config.mjs`
7. `package.json`
8. `.eslint-config-snapshotterrc`
9. `.eslint-config-snapshotterrc.json`
10. `.eslint-config-snapshotterrc.yaml`
11. `.eslint-config-snapshotterrc.yml`
12. `.eslint-config-snapshotterrc.js`
13. `.eslint-config-snapshotterrc.cjs`
14. `.eslint-config-snapshotterrc.mjs`

For `package.json`, use the `eslint-config-snapshotter` field.
