export default {
  workspaceInput: {
    mode: 'manual',
    workspaces: ['packages/ws-a', 'packages/ws-b']
  },
  grouping: {
    mode: 'match',
    groups: [{ name: 'default', match: ['**/*'] }]
  },
  sampling: {
    maxFilesPerWorkspace: 8,
    includeGlobs: ['**/*.ts'],
    excludeGlobs: ['**/node_modules/**'],
    hintGlobs: []
  }
}
