export default {
  workspaceInput: {
    mode: 'manual',
    workspaces: ['packages/api', 'packages/cli']
  },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['src/**/*.{js,jsx,ts,tsx,cjs,mjs}'],
    excludeGlobs: ['**/node_modules/**', '**/dist/**'],
    hintGlobs: []
  }
}
