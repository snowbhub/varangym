// Demo build (VITE_DEMO=1) — what runs on a static deployment.
//
// Static hosting has no API: passkey sign-in, per-profile sync and the management layer need the
// Node backend. The demo therefore stays local-only and boots with seeded example history.
export const DEMO = import.meta.env.VITE_DEMO === '1'
export const DEMO_SEEDED = 'varangym_demo_seeded_v1'
export const REPO = 'https://github.com/snowbhub/varangym'
