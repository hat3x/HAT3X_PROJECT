import { describe, it, expect, beforeEach } from "vitest"
import { getSupabaseClient, resetClient } from "../../src/database/client.js"

describe("getSupabaseClient", () => {
  beforeEach(() => resetClient())

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
    const url = process.env["SUPABASE_URL"]
    delete process.env["SUPABASE_URL"]
    resetClient()
    expect(() => getSupabaseClient()).toThrow("SUPABASE_URL")
    process.env["SUPABASE_URL"] = url
    resetClient()
  })
})
