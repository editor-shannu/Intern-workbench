import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Settings as SettingsIcon, LogOut } from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col bg-bench-950 text-paper font-sans">
      <header className="border-b border-bench-800 px-6 py-3 flex items-center justify-between shrink-0">
        <Link to="/" className="font-medium tracking-tight text-[15px]">
          Intern Workbench
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-dust">{user?.name}</span>
          <span className="text-[11px] border border-bench-800 px-1.5 py-0.5 text-dust">
            {user?.role}
          </span>
          <Link to="/settings" className="text-dust hover:text-paper" title="Settings">
            <SettingsIcon className="w-4 h-4" />
          </Link>
          <button
            onClick={() => {
              logout()
              navigate('/login')
            }}
            className="text-dust hover:text-danger"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
