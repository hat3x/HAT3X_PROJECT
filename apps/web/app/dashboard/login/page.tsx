"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage(): JSX.Element {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/dashboard/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push("/dashboard")
      router.refresh()
    } else {
      const data = await res.json() as { error?: string }
      setError(data.error ?? "Error de autenticación")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center">
      <div className="bg-surface-2 border border-border-subtle rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-text-primary text-xl font-semibold mb-6">HAT3X Dashboard</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-text-secondary text-sm mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-3 border border-border-subtle rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:border-purple-primary"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-primary text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-purple-light transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
