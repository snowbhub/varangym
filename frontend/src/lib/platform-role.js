import { api } from './api.js'

const MANAGER_ROLES = new Set(['owner', 'admin', 'trainer'])
const BUSINESS_ROLES = new Set(['owner', 'admin'])

export function membershipsOf(me) {
  if (Array.isArray(me?.memberships)) return me.memberships
  if (Array.isArray(me?.user?.memberships)) return me.user.memberships
  return []
}

export function platformAccess(me) {
  const memberships = membershipsOf(me)
  const platformAdmin = !!(me?.user?.is_platform_admin || me?.is_platform_admin)
  const business = memberships.some(m => m.workspace_type === 'organization' && BUSINESS_ROLES.has(m.role))
  const trainer = memberships.some(m => MANAGER_ROLES.has(m.role))
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
  return membershipsOf(me).filter(m => MANAGER_ROLES.has(m.role))
}

export function businessMemberships(me) {
  return membershipsOf(me).filter(m => m.workspace_type === 'organization' && BUSINESS_ROLES.has(m.role))
}

export async function loadPlatformIdentity() {
  return api('/api/me')
}
