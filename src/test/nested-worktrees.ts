/**
 * Playwright `testIgnore` entry for `.claude/` directories beneath a repo root.
 *
 * Agent worktrees live at `<repo>/.claude/worktrees/<name>/`, so a checkout
 * run from inside one has `.claude` in every absolute path. Playwright matches
 * `testIgnore` against the absolute path, which made an unanchored `.claude`
 * glob ignore every spec in a worktree run. Anchoring the match to
 * the config's own root ignores only `.claude/` directories below that root.
 *
 * Playwright tests a RegExp against the native path and, on Windows, again
 * against the forward-slash form, so every separator matches either slash. The
 * match is case-insensitive because a drive letter's case is not guaranteed to
 * agree between `__dirname` and a collected file. The `i` flag applies on every
 * platform, not only Windows; on a case-sensitive filesystem it can at most
 * over-ignore a path inside the repo's own tree, which is harmless.
 *
 * The anchor comes from `__dirname`, which Node resolves through symlinks,
 * while Playwright's `configDir` comes from `path.resolve`, which does not, so
 * a repo reached through a symlink, junction or `subst` drive can yield two
 * different prefixes and stop the ignore matching. That fails open — nested
 * `.claude/` specs get collected again rather than every spec being dropped —
 * and no current `testDir` reaches `.claude/`.
 */
export function nestedClaudeDirIgnore(rootDir: string): RegExp {
  const trimmedRoot = rootDir.replace(/[\\/]+$/, '')
  const rootPattern = trimmedRoot
    .split(/[\\/]/)
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\\\/]')
  return new RegExp(`^${rootPattern}[\\\\/]\\.claude[\\\\/]`, 'i')
}
