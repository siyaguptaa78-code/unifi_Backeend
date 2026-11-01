import { z } from "zod";

/** Shared validation schemas used by both API route handlers and React Hook Form. */

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/\d/, "Include at least one number");

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Name is too short")
  .max(120)
  .regex(/^[\p{L} .'-]+$/u, "Name contains invalid characters");

export const registerSchema = z
  .object({
    name: nameSchema,
    mobile: mobileSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or mobile number").max(160),
  password: z.string().min(1, "Enter your password").max(72),
});

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3, "Enter your email or mobile number") });

export const resetPasswordSchema = z
  .object({ token: z.string().min(20), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const profileSchema = z.object({
  name: nameSchema,
  mobile: mobileSchema,
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"]).optional(),
  dateOfBirth: z.string().optional().or(z.literal("")),
  address: z
    .object({
      line1: z.string().max(200).optional(),
      city: z.string().max(80).optional(),
      state: z.string().max(80).optional(),
      pincode: z.string().regex(/^\d{6}$/, "Invalid pincode").optional().or(z.literal("")),
    })
    .optional(),
  preferredCafe: z.string().optional().or(z.literal("")),
  marketingOptIn: z.boolean().optional(),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
export const objectIdSchema = objectId;

export const placeOrderSchema = z.object({
  cafeId: objectId,
  orderType: z.enum(["PRE_ORDER", "IN_CAFE", "DINE_IN"]).default("DINE_IN"),
  notes: z.string().trim().max(300).optional(),
  expectedArrivalTime: z.string().optional(),
  pickupSlot: z.string().max(50).optional(),
  idempotencyKey: z.string().min(8).max(64),
  items: z
    .array(z.object({ menuItemId: objectId, quantity: z.number().int().min(1).max(20) }))
    .min(1, "Your cart is empty")
    .max(30),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
  reason: z.string().trim().max(300).optional(),
});

export const cafeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  address: z.object({
    line1: z.string().trim().min(3).max(200),
    area: z.string().trim().max(100).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^\d{6}$/, "Invalid pincode"),
  }),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  openingHours: z.string().trim().max(60).optional(),
  acceptsPreOrders: z.boolean().default(true),
  estimatedPrepMinutes: z.coerce.number().int().min(1).max(180).default(15),
  seatingCapacity: z.coerce.number().int().min(0).max(2000).optional(),
  ownershipType: z.enum(["COMPANY", "FRANCHISE"]),
  franchise: objectId.optional().or(z.literal("")).nullable(),
  supervisor: objectId.optional().or(z.literal("")).nullable(),
  manager: objectId.optional().or(z.literal("")).nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "COMING_SOON"]),
});

export const franchisePackageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  amount: z.coerce.number().int().min(1),
  cafeSize: z.string().trim().min(1).max(80),
  setupInclusions: z.array(z.string().trim().min(1)).default([]),
  equipmentInclusions: z.array(z.string().trim().min(1)).default([]),
  trainingSupport: z.string().trim().max(500).default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const franchiseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/),
  package: objectId,
  owner: objectId.optional().or(z.literal("")).nullable(),
  supervisor: objectId.optional().or(z.literal("")).nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  status: z.enum(["PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED", "REJECTED", "TERMINATED"]),
  paymentStatus: z.enum(["PENDING", "PARTIAL", "PAID"]),
  agreedAmount: z.coerce.number().min(0),
  amountPaid: z.coerce.number().min(0),
  applicantName: z.string().trim().max(120).optional(),
  applicantEmail: z.string().trim().email().optional().or(z.literal("")),
  applicantPhone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const internalUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  mobile: mobileSchema,
  role: z.enum(["SUPER_ADMIN", "SUPERVISOR", "FRANCHISE_OWNER", "MANAGER", "STAFF"]),
  password: passwordSchema.optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
  cafes: z.array(objectId).optional(),
  designation: z.string().trim().max(80).optional(),
  canAssignCards: z.boolean().optional(),
  canCancelOrders: z.boolean().optional(),
});

export const menuCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  category: objectId,
  image: z.string().trim().url().optional().or(z.literal("")),
  pointsPrice: z.coerce.number().int().min(1).max(100000),
  isVeg: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const localItemRequestSchema = menuItemSchema.extend({ cafeId: objectId });

export const cardAssignSchema = z.object({
  customerId: objectId,
  uid: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-F0-9:]{4,32}$/, "Card UID must be hexadecimal (e.g. 04A1B2C3D4)"),
  cardType: z.enum(["NFC", "RFID"]),
  cafeId: objectId.optional(),
});

export const scanSchema = z.object({
  uid: z.string().trim().toUpperCase().min(4).max(32),
  cafeId: objectId,
  mode: z.enum(["AUTO", "ENTRY", "EXIT"]).default("AUTO"),
  deviceId: z.string().trim().max(64).default("SIMULATOR"),
});

export const dateRangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  cafeId: z.string().optional(),
  franchiseId: z.string().optional(),
  status: z.string().optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

