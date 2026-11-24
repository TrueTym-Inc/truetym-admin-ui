export const API_BASE_URL =
  process.env.NEXT_PUBLIC_TRUETYM_ADMIN_URL || 'https://hrms-dev-admin-backend.truetym.com';

/**
 * The tenant-facing HRMS backend. A few admin features (e.g. the What's New
 * changelog) are served from there rather than from the admin backend.
 */
export const PRIMARY_API_BASE_URL =
  process.env.NEXT_PUBLIC_PRIMARY_API_BASE_URL || 'https://hrms-dev-backend.truetym.com';
