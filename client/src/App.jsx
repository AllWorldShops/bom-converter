import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import AdminRoute from '@/components/layout/AdminRoute'
import AppShell from '@/components/layout/AppShell'
import Login from '@/pages/Login'
import SetupAdmin from '@/pages/SetupAdmin'
import Dashboard from '@/pages/Dashboard'
import Convert from '@/pages/Convert'
import Users from '@/pages/settings/Users'
import Customers from '@/pages/settings/Customers'
import UnitOfMeasure from '@/pages/settings/UnitOfMeasure'
import Advanced from '@/pages/settings/Advanced'
import api from '@/lib/api'

export default function App() {
  const { loading } = useAuth()
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)

  useEffect(() => {
    api.get('/setup/status')
      .then(r => setSetupRequired(r.data.setupRequired))
      .catch(() => {})
      .finally(() => setSetupChecked(true))
  }, [])

  if (loading || !setupChecked) {
    return (
      <div className="h-screen flex items-center justify-center bg-navy-950">
        <div className="animate-spin w-8 h-8 border-4 border-electric-400 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (setupRequired) return <Navigate to="/setup" replace />

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<SetupAdmin />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/convert" element={<Convert />} />
          <Route element={<AdminRoute />}>
            <Route path="/settings/users" element={<Users />} />
            <Route path="/settings/customers" element={<Customers />} />
            <Route path="/settings/unit-of-measure" element={<UnitOfMeasure />} />
            <Route path="/settings/advanced" element={<Advanced />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
