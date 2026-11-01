export const ROLES = ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  SUPERVISOR: "Area Supervisor",
  FRANCHISE_OWNER: "Franchise Owner",
  MANAGER: "Cafe Manager",
  STAFF: "Cafe Staff",
  CUSTOMER: "Customer",
};

/** Portal base path for each role — used for redirects and route protection. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  SUPERVISOR: "/supervisor/dashboard",
  FRANCHISE_OWNER: "/franchise/dashboard",
  MANAGER: "/manager/dashboard",
  STAFF: "/staff/dashboard",
  CUSTOMER: "/customer/dashboard",
};

export const PORTAL_ROLES: Record<string, Role[]> = {
  "/admin": ["SUPER_ADMIN"],
  "/supervisor": ["SUPERVISOR"],
  "/franchise": ["FRANCHISE_OWNER"],
  "/manager": ["MANAGER"],
  "/staff": ["STAFF"],
  "/customer": ["CUSTOMER"],
};

export const INTERNAL_ROLES: Role[] = ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"];
export const CAFE_SCOPED_ROLES: Role[] = ["SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"];

/** Central permission matrix. APIs check permissions, never only UI. */
export const PERMISSIONS = {
  "dashboard.platform": ["SUPER_ADMIN"],
  "dashboard.operations": ["SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"],
  "cafes.manage": ["SUPER_ADMIN"],
  "cafes.view": ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"],
  "franchises.manage": ["SUPER_ADMIN"],
  "franchises.view": ["SUPER_ADMIN", "FRANCHISE_OWNER", "SUPERVISOR"],
  "packages.manage": ["SUPER_ADMIN"],
  "users.manage": ["SUPER_ADMIN"],
  "staff.view": ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER"],
  "staff.manage": ["SUPER_ADMIN", "FRANCHISE_OWNER", "MANAGER"],
  "customers.view": ["SUPER_ADMIN"],
  "customers.manage": ["SUPER_ADMIN"],
  "customers.lookup": ["SUPER_ADMIN", "MANAGER", "STAFF"],
  "memberships.manage": ["SUPER_ADMIN"],
  "ledger.view": ["SUPER_ADMIN"],
  "ledger.adjust": ["SUPER_ADMIN"],
  "payments.view": ["SUPER_ADMIN"],
  "payments.refund": ["SUPER_ADMIN"],
  "menu.central.manage": ["SUPER_ADMIN"],
  "menu.approve": ["SUPER_ADMIN"],
  "menu.local.request": ["SUPER_ADMIN", "FRANCHISE_OWNER", "MANAGER"],
  "menu.availability": ["SUPER_ADMIN", "FRANCHISE_OWNER", "MANAGER"],
  "orders.view": ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"],
  "orders.update": ["SUPER_ADMIN", "MANAGER", "STAFF"],
  "orders.cancel": ["SUPER_ADMIN", "MANAGER", "STAFF"],
  "orders.refund": ["SUPER_ADMIN"],
  "cards.manage": ["SUPER_ADMIN", "MANAGER", "STAFF"],
  "visits.view": ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"],
  "visits.scan": ["SUPER_ADMIN", "MANAGER", "STAFF"],
  "visits.correct": ["SUPER_ADMIN", "MANAGER"],
  "reports.view": ["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER"],
  "settings.manage": ["SUPER_ADMIN"],
  "audit.view": ["SUPER_ADMIN"],
  "notifications.broadcast": ["SUPER_ADMIN"],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function portalForPath(pathname: string): string | null {
  const key = Object.keys(PORTAL_ROLES).find((p) => pathname === p || pathname.startsWith(p + "/"));
  return key ?? null;
}

