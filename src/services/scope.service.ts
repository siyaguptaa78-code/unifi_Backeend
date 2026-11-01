import { Types } from "mongoose";
import { Cafe } from "../models/Cafe";
import { Franchise } from "../models/Franchise";
import { Staff } from "../models/Staff";
import { Errors } from "../lib/errors";
import type { AuthUser } from "../lib/auth/session";

/**
 * Central cafe-scope resolution. Returns `null` for unrestricted access (Super Admin),
 * otherwise the list of cafe ids the user may access. Hierarchy (configurable until the
 * client confirms it):
 *  - SUPERVISOR      → cafes where cafe.supervisor = user, plus cafes of franchises supervised by user
 *  - FRANCHISE_OWNER → cafes belonging to franchises owned by user (supports one-to-many)
 *  - MANAGER/STAFF   → cafes listed in their Staff assignment
 *  - CUSTOMER        → no cafe scope (customers only see their own records)
 */
export async function getCafeScope(user: AuthUser): Promise<Types.ObjectId[] | null> {
  const uid = new Types.ObjectId(user.id);
  switch (user.role) {
    case "SUPER_ADMIN":
      return null;
    case "SUPERVISOR": {
      const franchises = await Franchise.find({ supervisor: uid }).select("_id").lean();
      const cafes = await Cafe.find({
        $or: [{ supervisor: uid }, { franchise: { $in: franchises.map((f) => f._id) } }],
      })
        .select("_id")
        .lean();
      return cafes.map((c) => c._id);
    }
    case "FRANCHISE_OWNER": {
      const franchises = await Franchise.find({ owner: uid }).select("_id").lean();
      const cafes = await Cafe.find({ franchise: { $in: franchises.map((f) => f._id) } })
        .select("_id")
        .lean();
      return cafes.map((c) => c._id);
    }
    case "MANAGER":
    case "STAFF": {
      const staff = await Staff.findOne({ user: uid, status: "ACTIVE" }).lean();
      return (staff?.cafes ?? []).map((c) => new Types.ObjectId(String(c)));
    }
    default:
      return [];
  }
}

export async function canAccessCafe(user: AuthUser, cafeId: string | Types.ObjectId): Promise<boolean> {
  const scope = await getCafeScope(user);
  if (scope === null) return true;
  return scope.some((c) => String(c) === String(cafeId));
}

export async function assertCafeAccess(user: AuthUser, cafeId: string | Types.ObjectId | null | undefined) {
  if (!cafeId || !(await canAccessCafe(user, cafeId))) throw Errors.forbidden("You do not have access to this cafe");
}

/**
 * Build a Mongo filter fragment restricting `field` to the user's cafe scope.
 * If `requestedCafe` is given, it is validated against the scope.
 */
export async function cafeFilter(user: AuthUser, requestedCafe?: string | null, field = "cafe"): Promise<Record<string, unknown>> {
  const scope = await getCafeScope(user);
  if (requestedCafe) {
    if (!Types.ObjectId.isValid(requestedCafe)) throw Errors.badRequest("Invalid cafe id");
    if (scope !== null && !scope.some((c) => String(c) === requestedCafe)) throw Errors.forbidden("You do not have access to this cafe");
    return { [field]: new Types.ObjectId(requestedCafe) };
  }
  if (scope === null) return {};
  return { [field]: { $in: scope } };
}

