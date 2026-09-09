/**
 * Integration evidence for the persisted layout model: ownership, bounds, and
 * the legacy shapes that must keep loading.
 *
 * WHY THESE GO THROUGH TWO REAL USERS AND NO ROUTE
 *
 * `resumes.layout_settings` is written straight from the browser through
 * PostgREST. There is no route handler in front of it, so a route-level
 * `.eq('user_id', ...)` filter is not what protects it — the four policies on
 * `public.resumes` are, and RLS is row-level rather than column-level, which is
 * why a column added by migration 007 needs no policy of its own.
 *
 * "Needs no policy of its own" is a claim about PostgreSQL that has to be
 * executed rather than argued, because it holds only while the table's
 * privileges are table-wide: a column-scoped GRANT would leave a new column
 * ungranted, and a column-scoped one added later would leave it unprotected.
 * So OWNER_B, holding a real session with the anon key exactly as the browser
 * does, tries to read and to write OWNER_A's layout settings, and the
 * assertions are on what actually happened to the row.
 *
 * WHERE THE SERVICE-ROLE CLIENT IS AND IS NOT USED
 *
 * Every attack runs as an ordinary authenticated user. The service-role client
 * appears only to seed a fixture and to read a row back after a rejected write:
 * an RLS-subject read returns zero rows both when a write was refused and when
 * it succeeded but is invisible to the reader, and those are not the same
 * outcome. Reading as service-role is the only way to tell them apart.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/types/supabase'
import {
  adminClient,
  assertStackReachable,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '@/test/integration/supabase'
import {
  DEFAULT_RESUME_LAYOUT,
  MAX_LAYOUT_BLOB_LENGTH,
  resolveResumeLayout,
  toStoredLayout,
} from './layout-settings'

/** A layout OWNER_A chose and OWNER_B must not be able to see or change. */
const OWNER_A_LAYOUT = toStoredLayout({
  ...DEFAULT_RESUME_LAYOUT,
  fontScale: 1.15,
  sidebarHue: 17,
  fontFamily: 'Georgia, serif',
})

/** What OWNER_B would overwrite it with, if the policies let them. */
const ATTACKER_LAYOUT = toStoredLayout({
  ...DEFAULT_RESUME_LAYOUT,
  fontScale: 0.7,
  sidebarHue: 300,
})

describe('persisted layout settings', () => {
  let ownerA: TestUser
  let ownerB: TestUser
  let resumeId: string

  beforeAll(async () => {
    await assertStackReachable()
    ownerA = await createTestUser()
    ownerB = await createTestUser()

    const { data, error } = await adminClient()
      .from('resumes')
      .insert({
        user_id: ownerA.id,
        title: 'Owner A layout fixture',
        template: 'professional',
        layout_settings: OWNER_A_LAYOUT,
      })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`Could not seed OWNER_A's resume: ${error?.message ?? 'no row returned'}`)
    }
    resumeId = data.id
  })

  afterAll(async () => {
    // The resume goes with its owner by ON DELETE CASCADE.
    if (ownerA) await deleteTestUser(ownerA.id)
    if (ownerB) await deleteTestUser(ownerB.id)
  })

  describe('ownership', () => {
    it('lets the owner read back their own layout settings', async () => {
      // The control. Without it a policy that denied everyone would pass every
      // assertion below while breaking the feature.
      const { data, error } = await ownerA.client
        .from('resumes')
        .select('layout_settings')
        .eq('id', resumeId)
        .single()

      expect(error).toBeNull()
      expect(data?.layout_settings).toEqual(OWNER_A_LAYOUT)
    })

    it("does not let OWNER_B read OWNER_A's layout settings", async () => {
      const { data, error } = await ownerB.client
        .from('resumes')
        .select('id, layout_settings')
        .eq('id', resumeId)

      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it("does not let OWNER_B read OWNER_A's layout settings by listing every resume", async () => {
      // Addressing the row by id could in principle be refused by something
      // other than the SELECT policy. An unfiltered list cannot be.
      const { data, error } = await ownerB.client.from('resumes').select('id, layout_settings')

      expect(error).toBeNull()
      expect(data?.some((row) => row.id === resumeId)).toBe(false)
    })

    it("does not let OWNER_B write OWNER_A's layout settings", async () => {
      const { data, error } = await ownerB.client
        .from('resumes')
        .update({ layout_settings: ATTACKER_LAYOUT })
        .eq('id', resumeId)
        .select('id')

      // RLS makes a forbidden UPDATE match no rows rather than error, so the
      // absence of an error proves nothing on its own.
      expect(error).toBeNull()
      expect(data).toEqual([])

      // What actually settles it: the stored value, read past RLS.
      const { data: stored } = await adminClient()
        .from('resumes')
        .select('layout_settings')
        .eq('id', resumeId)
        .single()
      expect(stored?.layout_settings).toEqual(OWNER_A_LAYOUT)
    })

    it("does not let OWNER_B clear OWNER_A's layout settings", async () => {
      // Writing NULL is the other half of a write: it would make the account
      // look as though it had never persisted anything, which is precisely the
      // state that lets a browser's values be adopted instead.
      await ownerB.client.from('resumes').update({ layout_settings: null }).eq('id', resumeId)

      const { data: stored } = await adminClient()
        .from('resumes')
        .select('layout_settings')
        .eq('id', resumeId)
        .single()
      expect(stored?.layout_settings).toEqual(OWNER_A_LAYOUT)
    })

    it('lets the owner update their own layout settings', async () => {
      // The second control: the write path the feature depends on still works
      // for the person it belongs to, and the column is genuinely writable
      // under the anon key rather than merely unreachable for everyone.
      const next = toStoredLayout({ ...DEFAULT_RESUME_LAYOUT, fontScale: 1.05 })
      const { error } = await ownerA.client
        .from('resumes')
        .update({ layout_settings: next })
        .eq('id', resumeId)
      expect(error).toBeNull()

      const { data } = await ownerA.client
        .from('resumes')
        .select('layout_settings')
        .eq('id', resumeId)
        .single()
      expect(data?.layout_settings).toEqual(next)

      // Restore, so the ordering of the tests above cannot matter.
      await ownerA.client
        .from('resumes')
        .update({ layout_settings: OWNER_A_LAYOUT })
        .eq('id', resumeId)
    })
  })

  describe('resumes_layout_settings_check', () => {
    it('refuses an oversized payload even from the row owner', async () => {
      // The policies decide whose row may be written; nothing in them decides
      // what may be put in it. This constraint is what does.
      const oversized = { ...OWNER_A_LAYOUT, filler: 'x'.repeat(MAX_LAYOUT_BLOB_LENGTH) }
      const { error } = await ownerA.client
        .from('resumes')
        .update({ layout_settings: oversized })
        .eq('id', resumeId)

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/resumes_layout_settings_check/)

      const { data: stored } = await adminClient()
        .from('resumes')
        .select('layout_settings')
        .eq('id', resumeId)
        .single()
      expect(stored?.layout_settings).toEqual(OWNER_A_LAYOUT)
    })

    it('refuses a value that is not a JSON object', async () => {
      for (const bad of ['a bare string', 42, ['skills']]) {
        const { error } = await ownerA.client
          .from('resumes')
          .update({ layout_settings: bad })
          .eq('id', resumeId)
        expect(error?.message).toMatch(/resumes_layout_settings_check/)
      }
    })

    it('accepts NULL, which is how a resume says it has no persisted settings', async () => {
      const { error } = await ownerA.client
        .from('resumes')
        .update({ layout_settings: null })
        .eq('id', resumeId)
      expect(error).toBeNull()

      await ownerA.client
        .from('resumes')
        .update({ layout_settings: OWNER_A_LAYOUT })
        .eq('id', resumeId)
    })
  })

  describe('rows written before migration 007', () => {
    /**
     * The three shapes `custom_sections` can be in, none of which may make a
     * resume unopenable. Each is stored for real and read back through the same
     * function the editor and the preview use, so this exercises the JSONB
     * round trip rather than an in-memory literal.
     */
    const LEGACY_SHAPES: Array<{ name: string; customSections: Json }> = [
      { name: 'a bare array, the oldest shape', customSections: [{ title: 'Awards' }] },
      { name: 'an empty object', customSections: {} },
      {
        name: 'the wrapped object that carried layout settings',
        customSections: {
          items: [{ title: 'Awards' }],
          layoutSettings: { hiddenMainSections: ['education'], sidebarOrder: ['training'] },
        },
      },
    ]

    for (const shape of LEGACY_SHAPES) {
      it(`loads a resume whose custom_sections is ${shape.name}`, async () => {
        const { data, error } = await adminClient()
          .from('resumes')
          .insert({
            user_id: ownerA.id,
            title: `Legacy shape: ${shape.name}`,
            template: 'modern',
            // Deliberately a shape the current writer never produces.
            custom_sections: shape.customSections,
          })
          .select('id, layout_settings, custom_sections')
          .single()

        expect(error).toBeNull()
        expect(data?.layout_settings).toBeNull()

        const layout = resolveResumeLayout(
          { layout_settings: data?.layout_settings, custom_sections: data?.custom_sections },
          null,
        )
        // Whatever the shape carried, the resume resolves to a complete model.
        expect(layout.fontFamily).toBe(DEFAULT_RESUME_LAYOUT.fontFamily)
        expect(layout.sidebarOrder).toHaveLength(4)
      })
    }

    it('reads the layout settings the wrapped shape carried', async () => {
      const { data } = await adminClient()
        .from('resumes')
        .insert({
          user_id: ownerA.id,
          title: 'Legacy wrapped shape with settings',
          template: 'modern',
          custom_sections: {
            items: [],
            layoutSettings: { hiddenMainSections: ['education'] },
          },
        })
        .select('layout_settings, custom_sections')
        .single()

      const layout = resolveResumeLayout(
        { layout_settings: data?.layout_settings, custom_sections: data?.custom_sections },
        null,
      )
      expect(layout.hiddenMainSections).toEqual(['education'])
    })
  })
})
