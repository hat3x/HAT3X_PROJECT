import { mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import simpleGit from "simple-git"

export interface WorkspaceInput {
  taskId: string
  clientId: string | null
  reposRoot: string
}

export async function prepareWorkspace(input: WorkspaceInput): Promise<{ dir: string; branch: string }> {
  const dir = join(input.reposRoot, input.clientId ?? "interno")
  mkdirSync(dir, { recursive: true })

  const git = simpleGit(dir)
  if (!existsSync(join(dir, ".git"))) {
    await git.init()
    await git.addConfig("user.name", "HAT3X Office")
    await git.addConfig("user.email", "office@hat3x.com")
    await git.raw(["commit", "--allow-empty", "-m", "chore: init workspace"])
  }

  const branch = `hat3x/${input.taskId}`
  const branches = await git.branchLocal()
  if (branches.all.includes(branch)) {
    await git.checkout(branch)
  } else {
    await git.checkoutLocalBranch(branch)
  }
  return { dir, branch }
}
