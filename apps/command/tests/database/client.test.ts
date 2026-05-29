import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getSupabaseClient, resetClient } from "../../src/database/client.js"

describe("getSupabaseClient", () => {
  let originalUrl: string | undefined

  beforeEach(() => {
    originalUrl = process.env["SUPABASE_URL"]
    resetClient()
  })

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env["SUPABASE_URL"] = originalUrl
    } else {
      delete process.env["SUPABASE_URL"]
    }
    resetClient()
  })

  it("returns a client when env vars are set", () => {
    const client = getSupabaseClient()
    expect(client).toBeDefined()
  })

  it("returns the same instance on repeated calls", () => {
    const a = getSupabaseClient()
    const b = getSupabaseClient()
    expect(a).toBe(b)
  })

  it("throws when SUPABASE_URL is missing", () => {
    delete process.env["SUPABASE_URL"]
    resetClient()
    expect(() => getSupabaseClient()).toThrow("SUPABASE_URL")
  })
})
