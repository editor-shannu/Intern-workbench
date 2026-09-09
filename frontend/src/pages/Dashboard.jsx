import { useAuth } from '../context/AuthContext'
import AdminBoard from './AdminBoard'
import InternDashboard from './InternDashboard'

export default function Dashboard() {
  const { user } = useAuth()
  return user?.role === 'admin' ? <AdminBoard /> : <InternDashboard />
}
