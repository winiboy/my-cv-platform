import { describe, expect, it } from 'vitest'
import { nestedClaudeDirIgnore } from './nested-worktrees'

describe('nestedClaudeDirIgnore', () => {
  describe('with a Windows root that is itself inside a worktree', () => {
    const root = 'E:\\x\\my-cv-platform\\.claude\\worktrees\\wt'
    const pattern = nestedClaudeDirIgnore(root)

    const ownSpec = `${root}\\e2e\\auth.spec.ts`
    const nestedSpec = `${root}\\.claude\\worktrees\\other\\e2e\\a.spec.ts`
    const outsideSpec = 'E:\\x\\elsewhere\\.claude\\worktrees\\other\\e2e\\a.spec.ts'
    const toForwardSlashes = (p: string) => p.replace(/\\/g, '/')
    const toLowerDrive = (p: string) => p.replace(/^E:/, 'e:')

    it("does not ignore the root's own specs", () => {
      expect(pattern.test(ownSpec)).toBe(false)
      expect(pattern.test(toForwardSlashes(ownSpec))).toBe(false)
      expect(pattern.test(toLowerDrive(ownSpec))).toBe(false)
    })

    it('ignores a .claude directory beneath the root', () => {
      expect(pattern.test(nestedSpec)).toBe(true)
      expect(pattern.test(toForwardSlashes(nestedSpec))).toBe(true)
      expect(pattern.test(toLowerDrive(nestedSpec))).toBe(true)
    })

    it('does not ignore a .claude directory outside the root', () => {
      expect(pattern.test(outsideSpec)).toBe(false)
      expect(pattern.test(toForwardSlashes(outsideSpec))).toBe(false)
      expect(pattern.test(toLowerDrive(outsideSpec))).toBe(false)
    })

    it('behaves the same when the root has a trailing separator', () => {
      const withTrailing = nestedClaudeDirIgnore(`${root}\\`)
      expect(withTrailing.test(ownSpec)).toBe(false)
      expect(withTrailing.test(nestedSpec)).toBe(true)
    })
  })

  describe('with a POSIX root', () => {
    const root = '/home/ci/my-cv-platform/.claude/worktrees/wt'
    const pattern = nestedClaudeDirIgnore(root)

    it("does not ignore the root's own specs", () => {
      expect(pattern.test(`${root}/e2e/auth.spec.ts`)).toBe(false)
    })

    it('ignores a .claude directory beneath the root', () => {
      expect(pattern.test(`${root}/.claude/worktrees/other/e2e/a.spec.ts`)).toBe(true)
    })

    it('does not ignore a .claude directory outside the root', () => {
      expect(pattern.test('/home/ci/elsewhere/.claude/worktrees/other/e2e/a.spec.ts')).toBe(false)
    })
  })

  it('does not treat a sibling directory that shares the root as a prefix as beneath it', () => {
    const pattern = nestedClaudeDirIgnore('/repo/app')
    expect(pattern.test('/repo/app-copy/.claude/worktrees/other/e2e/a.spec.ts')).toBe(false)
  })

  it('escapes regex-special characters in the root', () => {
    const pattern = nestedClaudeDirIgnore('/tmp/a.b+(c)')
    expect(pattern.test('/tmp/a.b+(c)/.claude/worktrees/other/e2e/a.spec.ts')).toBe(true)
    // Unescaped, `.` would match any character, `+` would repeat `b`, and
    // `(c)` would be a group matching a bare `c`.
    expect(pattern.test('/tmp/aXbb(c)/.claude/worktrees/other/e2e/a.spec.ts')).toBe(false)
    expect(pattern.test('/tmp/a.bbc/.claude/worktrees/other/e2e/a.spec.ts')).toBe(false)
  })
})
