import { Types } from "mongoose";
import { MenuCategory } from "@/models/MenuCategory";
import { MenuItem } from "@/models/MenuItem";
import { CafeMenuCustomization } from "@/models/CafeMenuCustomization";
import { Cafe } from "@/models/Cafe";
import { Errors } from "@/lib/errors";
import { assertCafeAccess } from "@/services/scope.service";
import { logAudit } from "@/services/audit.service";
import type { AuthUser } from "@/lib/auth/session";

export type ResolvedMenuItem = {
  _id: string;
  name: string;
  description: string;
  image?: string | null;
  isVeg: boolean;
  scope: "CENTRAL" | "LOCAL";
  category: { _id: string; name: string; slug: string };
  basePrice: number;
  pointsPrice: number;
  priceOverridden: boolean;
  isAvailable: boolean;
  pendingPrice?: number | null;
  priceStatus?: string;
};

/**
 * Resolves the effective menu for a cafe: central approved items + that cafe's approved local
 * items, applying cafe-specific availability and APPROVED price overrides only.
 */
export async function getCafeMenu(cafeId: string, opts: { includeUnavailable?: boolean } = {}): Promise<ResolvedMenuItem[]> {
  if (!Types.ObjectId.isValid(cafeId)) throw Errors.badRequest("Invalid cafe");
  const cid = new Types.ObjectId(cafeId);
  const [categories, items, customizations] = await Promise.all([
    MenuCategory.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    MenuItem.find({
      active: true,
      approvalStatus: "APPROVED",
      $or: [{ scope: "CENTRAL" }, { scope: "LOCAL", cafe: cid }],
    }).lean(),
    CafeMenuCustomization.find({ cafe: cid }).lean(),
  ]);
  const catMap = new Map(categories.map((c) => [String(c._id), c]));
  const custMap = new Map(customizations.map((c) => [String(c.menuItem), c]));
  const out: ResolvedMenuItem[] = [];
  for (const it of items) {
    const cat = catMap.get(String(it.category));
    if (!cat) continue;
    const cu = custMap.get(String(it._id));
    const isAvailable = cu ? cu.isAvailable !== false : true;
    if (!isAvailable && !opts.includeUnavailable) continue;
    const override = cu?.priceStatus === "APPROVED" && cu.approvedPrice ? cu.approvedPrice : null;
    out.push({
      _id: String(it._id),
      name: it.name,
      description: it.description ?? "",
      image: it.image,
      isVeg: it.isVeg ?? true,
      scope: it.scope as "CENTRAL" | "LOCAL",
      category: { _id: String(cat._id), name: cat.name, slug: cat.slug },
      basePrice: it.pointsPrice,
      pointsPrice: override ?? it.pointsPrice,
      priceOverridden: Boolean(override),
      isAvailable,
      pendingPrice: cu?.priceStatus === "PENDING" ? cu.requestedPrice : null,
      priceStatus: cu?.priceStatus ?? "NONE",
    });
  }
  const order = new Map(categories.map((c, i) => [String(c._id), i]));
  out.sort((a, b) => (order.get(a.category._id)! - order.get(b.category._id)!) || a.name.localeCompare(b.name));
  return out;
}

export async function setAvailability(actor: AuthUser, cafeId: string, menuItemId: string, isAvailable: boolean, ip?: string) {
  await assertCafeAccess(actor, cafeId);
  const item = await MenuItem.findById(menuItemId).lean();
  if (!item) throw Errors.notFound("Menu item");
  if (item.scope === "LOCAL" && String(item.cafe) !== cafeId) throw Errors.forbidden();
  const doc = await CafeMenuCustomization.findOneAndUpdate(
    { cafe: cafeId, menuItem: menuItemId },
    { $set: { isAvailable }, $setOnInsert: { requestedBy: actor.id } },
    { upsert: true, new: true }
  );
  await logAudit(actor, "MENU_AVAILABILITY_CHANGED", "MenuItem", menuItemId, { isAvailable, item: item.name }, { cafe: cafeId, ip });
  return doc;
}

export async function requestPriceOverride(actor: AuthUser, cafeId: string, menuItemId: string, price: number, ip?: string) {
  await assertCafeAccess(actor, cafeId);
  const item = await MenuItem.findById(menuItemId).lean();
  if (!item || item.scope !== "CENTRAL") throw Errors.badRequest("Price overrides apply only to central menu items");
  const doc = await CafeMenuCustomization.findOneAndUpdate(
    { cafe: cafeId, menuItem: menuItemId },
    { $set: { requestedPrice: price, priceStatus: "PENDING", requestedBy: actor.id, reviewNote: null } },
    { upsert: true, new: true }
  );
  await logAudit(actor, "MENU_PRICE_OVERRIDE_REQUESTED", "CafeMenuCustomization", doc._id, { item: item.name, price }, { cafe: cafeId, ip });
  return doc;
}

export async function reviewPriceOverride(admin: AuthUser, customizationId: string, approve: boolean, note?: string, ip?: string) {
  const doc = await CafeMenuCustomization.findById(customizationId);
  if (!doc || doc.priceStatus !== "PENDING") throw Errors.notFound("Pending price request");
  doc.priceStatus = approve ? "APPROVED" : "REJECTED";
  if (approve) doc.approvedPrice = doc.requestedPrice ?? undefined;
  doc.reviewedBy = new Types.ObjectId(admin.id);
  doc.reviewNote = note;
  await doc.save();
  await logAudit(admin, approve ? "MENU_PRICE_OVERRIDE_APPROVED" : "MENU_PRICE_OVERRIDE_REJECTED", "CafeMenuCustomization", doc._id, { note }, { cafe: doc.cafe, ip });
  return doc;
}

export async function clearPriceOverride(actor: AuthUser, cafeId: string, menuItemId: string) {
  await assertCafeAccess(actor, cafeId);
  await CafeMenuCustomization.updateOne(
    { cafe: cafeId, menuItem: menuItemId },
    { $set: { priceStatus: "NONE" }, $unset: { approvedPrice: 1, requestedPrice: 1 } }
  );
  await logAudit(actor, "MENU_PRICE_OVERRIDE_CLEARED", "MenuItem", menuItemId, {}, { cafe: cafeId });
}

export async function requestLocalItem(
  actor: AuthUser,
  input: { cafeId: string; name: string; description: string; category: string; pointsPrice: number; isVeg: boolean; image?: string },
  ip?: string
) {
  await assertCafeAccess(actor, input.cafeId);
  if (!(await Cafe.exists({ _id: input.cafeId }))) throw Errors.notFound("Cafe");
  const item = await MenuItem.create({
    name: input.name,
    description: input.description,
    category: input.category,
    pointsPrice: input.pointsPrice,
    isVeg: input.isVeg,
    image: input.image || undefined,
    scope: "LOCAL",
    cafe: input.cafeId,
    approvalStatus: actor.role === "SUPER_ADMIN" ? "APPROVED" : "PENDING",
    createdBy: actor.id,
  });
  await logAudit(actor, "MENU_LOCAL_ITEM_REQUESTED", "MenuItem", item._id, { name: item.name }, { cafe: input.cafeId, ip });
  return item;
}

export async function reviewLocalItem(admin: AuthUser, itemId: string, approve: boolean, note?: string, ip?: string) {
  const item = await MenuItem.findOne({ _id: itemId, scope: "LOCAL", approvalStatus: "PENDING" });
  if (!item) throw Errors.notFound("Pending local item");
  item.approvalStatus = approve ? "APPROVED" : "REJECTED";
  item.reviewedBy = new Types.ObjectId(admin.id);
  item.reviewNote = note;
  await item.save();
  await logAudit(admin, approve ? "MENU_LOCAL_ITEM_APPROVED" : "MENU_LOCAL_ITEM_REJECTED", "MenuItem", item._id, { note }, { cafe: item.cafe, ip });
  return item;
}

export async function getPendingApprovals() {
  const [items, prices] = await Promise.all([
    MenuItem.find({ scope: "LOCAL", approvalStatus: "PENDING" }).populate("cafe", "name code").populate("category", "name").populate("createdBy", "name").sort({ createdAt: -1 }).lean(),
    CafeMenuCustomization.find({ priceStatus: "PENDING" }).populate("cafe", "name code").populate("menuItem", "name pointsPrice").populate("requestedBy", "name").sort({ updatedAt: -1 }).lean(),
  ]);
  return { items, prices };
}

