import { api } from './api.js'

const BUSINESS_ROLES = new Set(['owner', 'admin'])

export function membershipsOf(me) {
  if (Array.isArray(me?.memberships)) return me.memberships
  if (Array.isArray(me?.user?.memberships)) return me.user.memberships
  return []
}

// A management switch must mean the person really has that role. In particular, owning a
// Business workspace does not automatically make someone a Coach. Organization trainers do get
// Coach mode, and an independent-trainer owner gets Coach mode for their own workspace.
export function isTrainerMembership(m) {
  if (!m || m.status === 'disabled' || m.ended_at) return false
  if (m.role === 'trainer') return true
  return m.workspace_type === 'independent_trainer' && m.role === 'owner'
}

export function platformAccess(me) {
  const memberships = membershipsOf(me)
  const platformAdmin = !!(me?.user?.is_platform_admin || me?.is_platform_admin)
  const business = memberships.some(m => m.workspace_type === 'organization' && BUSINESS_ROLES.has(m.role) && m.status !== 'disabled' && !m.ended_at)
  const trainer = memberships.some(isTrainerMembership)
  return {
    platformAdmin,
    business,
    trainer,
    canManage: platformAdmin || business || trainer,
    memberships,
  }
}

export function defaultManagementRoute(me) {
  const access = platformAccess(me)
  if (access.platformAdmin) return '/admin'
  if (access.business) return '/business'
  if (access.trainer) return '/trainer'
  return null
}

export function trainerMemberships(me) {
  return membershipsOf(me).filter(isTrainerMembership)
}

export function businessMemberships(me) {
  return membershipsOf(me).filter(m => m.workspace_type === 'organization' && BUSINESS_ROLES.has(m.role) && m.status !== 'disabled' && !m.ended_at)
}

export async function loadPlatformIdentity() {
  return api('/api/me')
}
