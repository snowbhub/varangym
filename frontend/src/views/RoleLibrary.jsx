import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { loadPlatformIdentity, platformAccess } from '../lib/platform-role.js'
import { setRoleMode } from '../lib/role-mode.js'
import Library from './Library.jsx'

export default function RoleLibrary({ mode }) {
  const [identity, setIdentity] = useState(undefined)

  useEffect(() => {
    let live = true
    setRoleMode(mode)
    loadPlatformIdentity().then(me => { if (live) setIdentity(me) }).catch(() => { if (live) setIdentity(null) })
    return () => { live = false }
  }, [mode])

  if (identity === undefined) return <div className="empty">Завантаження…</div>
  const access = platformAccess(identity)
  const allowed = mode === 'business' ? access.business : mode === 'trainer' ? access.trainer : access.platformAdmin
  if (!allowed) return <Navigate to="/home" replace />
  return <Library />
}
