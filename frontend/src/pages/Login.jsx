import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function BlueprintGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.16]"
      style={{
        backgroundImage:
          'linear-gradient(#7093A8 1px, transparent 1px), linear-gradient(90deg, #7093A8 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    />
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const loggedUser = await login(email, password)
      if (loggedUser?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-bench-950 text-paper font-sans">
      <div className="hidden md:flex w-1/2 relative overflow-hidden border-r border-bench-800 items-center px-16">
        <BlueprintGrid />
        <div className="relative z-10">
          <div className="text-sm text-dust mb-3">Gayatri-AI conversion sprint</div>
          <h1 className="text-4xl font-medium leading-tight tracking-tight">
            Intern
            <br />
            Workbench
          </h1>
          <p className="mt-4 text-dust max-w-xs text-[15px] leading-relaxed">
            Pick up your assigned task, get AI-assisted code generation scoped to it, and open a
            normal pull request when you're done.
          </p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm border border-bench-800 bg-bench-900 p-8 space-y-5">
          <div>
            <h2 className="text-lg font-medium">Sign in</h2>
            <p className="text-sm text-dust mt-1">Use the account your admin set up for you.</p>
          </div>
          {error && (
            <div className="text-sm text-danger border border-danger-dim bg-danger-dim/40 px-3 py-2">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-dust">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="w-full rounded bg-bench-950 border border-bench-800 px-3 py-2 text-sm focus:outline-none focus:border-brass"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-dust">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="w-full rounded bg-bench-950 border border-bench-800 px-3 py-2 text-sm focus:outline-none focus:border-brass"
            />
          </div>
          <button
            disabled={loading}
            type="submit"
            className="w-full rounded bg-brass hover:bg-brass/90 disabled:opacity-50 text-bench-950 font-medium py-2 text-sm transition"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
