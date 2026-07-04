import { describe, it, expect } from "vitest"
import { mkdtempSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import simpleGit from "simple-git"
import { prepareWorkspace } from "../../src/executor/workspace.js"

describe("prepareWorkspace", () => {
  it("creates dir, inits git and checks out task branch", async () => {
    const reposRoot = mkdtempSync(join(tmpdir(), "hat3x-ws-"))
    const result = await prepareWorkspace({ taskId: "HAT3X-042", clientId: "novamed", reposRoot })
    expect(result.dir).toBe(join(reposRoot, "novamed"))
    expect(result.branch).toBe("hat3x/HAT3X-042")
    expect(existsSync(join(result.dir, ".git"))).toBe(true)
    const branch = await simpleGit(result.dir).revparse(["--abbrev-ref", "HEAD"])
    expect(branch.trim()).toBe("hat3x/HAT3X-042")
  })

  it("uses 'interno' folder when clientId is null", async () => {
    const reposRoot = mkdtempSync(join(tmpdir(), "hat3x-ws-"))
    const result = await prepareWorkspace({ taskId: "HAT3X-043", clientId: null, reposRoot })
    expect(result.dir).toBe(join(reposRoot, "interno"))
  })
})
