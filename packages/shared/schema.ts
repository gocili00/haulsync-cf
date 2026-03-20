import { sql } from "drizzle-orm";
import { pgTable, text, integer, decimal, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"]);
export const employmentTypeEnum = pgEnum("employment_type", ["W2_COMPANY_DRIVER", "N1099_COMPANY_DRIVER", "OWNER_OPERATOR", "LEASE_TO_PURCHASE"]);
export const driverStatusEnum = pgEnum("driver_status", ["ACTIVE", "INACTIVE"]);
export const loadStatusEnum = pgEnum("load_status", ["DRAFT", "BOL_UPLOADED", "OCR_DONE", "SUBMITTED", "VERIFIED", "APPROVED", "LOCKED"]);
export const payItemTypeEnum = pgEnum("pay_item_type", ["EARNING", "DEDUCTION", "REIMBURSEMENT"]);
export const payItemCategoryEnum = pgEnum("pay_item_category", [
  "EXTRA_STOP", "LAYOVER", "DETENTION", "BREAKDOWN",
  "INSPECTION_L1", "INSPECTION_L2", "INSPECTION_L3",
  "SAFETY_BONUS", "ESCROW", "ADVANCE", "FUEL", "INSURANCE", "OTHER"
]);
export const payItemStatusEnum = pgEnum("pay_item_status", ["DRAFT", "SUBMITTED", "APPROVED", "LOCKED"]);
export const payrollStatusEnum = pgEnum("payroll_status", ["OPEN", "REVIEW", "APPROVED", "PAID", "LOCKED"]);
export const revenueModelEnum = pgEnum("revenue_mode", ["AUTO_RPM", "MANUAL", "FLAT"]);
export const costFrequencyEnum = pgEnum("cost_frequency", ["WEEKLY", "MONTHLY"]);
export const costScopeEnum = pgEnum("cost_scope", ["GLOBAL", "DRIVER_TYPE", "TRUCK"]);
export const profitabilityScoreEnum = pgEnum("profitability_score", ["A", "B", "C", "D", "F"]);
export const inviteStatusEnum = pgEnum("invite_status", ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]);

// ── Tables ────────────────────────────────────────────────────────────────
export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  timezone: text("timezone").default("America/Chicago"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companySettings = pgTable("company_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id).unique(),
  allowAdminInvites: boolean("allow_admin_invites").notNull().default(false),
  dispatcherCanSeeUnassigned: boolean("dispatcher_can_see_unassigned").notNull().default(false),
  defaultRevenueMode: text("default_revenue_mode").default("MANUAL"),
  defaultRevenueRpm: decimal("default_revenue_rpm", { precision: 10, scale: 4 }),
  defaultRevenueFlat: decimal("default_revenue_flat", { precision: 10, scale: 2 }),
});

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: roleEnum("role").notNull().default("DRIVER"),
  companyId: integer("company_id").references(() => companies.id),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  dispatcherPayModel: text("dispatcher_pay_model"),
  dispatcherPayRate: decimal("dispatcher_pay_rate", { precision: 10, scale: 2 }).default("0"),
});

export const driverProfiles = pgTable("driver_profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  phone: text("phone"),
  address: text("address"),
  cdlNumber: text("cdl_number"),
  cdlExpiration: text("cdl_expiration"),
  medicalExpiration: text("medical_expiration"),
  ratePerMile: decimal("rate_per_mile", { precision: 10, scale: 4 }).notNull().default("0.00"),
  employmentType: employmentTypeEnum("employment_type").notNull().default("W2_COMPANY_DRIVER"),
  status: driverStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  assignedDispatcherId: integer("assigned_dispatcher_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  assignedByUserId: integer("assigned_by_user_id").references(() => users.id),
  payModel: text("pay_model").notNull().default("CPM"),
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }),
  flatFeeAmount: decimal("flat_fee_amount", { precision: 10, scale: 2 }),
  fuelPaidBy: text("fuel_paid_by").notNull().default("COMPANY"),
});

export const trucks = pgTable("trucks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  truckNumber: text("truck_number").notNull(),
  vin: text("vin"),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  ownershipType: text("ownership_type").notNull().default("COMPANY"),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  monthlyPayment: decimal("monthly_payment", { precision: 10, scale: 2 }),
  insuranceMonthly: decimal("insurance_monthly", { precision: 10, scale: 2 }),
  maintenanceReserve: decimal("maintenance_reserve", { precision: 10, scale: 2 }),
  eldCost: decimal("eld_cost", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const loads = pgTable("loads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverUserId: integer("driver_user_id").notNull().references(() => users.id),
  companyId: integer("company_id").references(() => companies.id),
  truckId: integer("truck_id").references(() => trucks.id),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  pickupDate: text("pickup_date"),
  deliveryDate: text("delivery_date"),
  calculatedMiles: decimal("calculated_miles", { precision: 10, scale: 2 }),
  adjustedMiles: decimal("adjusted_miles", { precision: 10, scale: 2 }),
  finalMiles: decimal("final_miles", { precision: 10, scale: 2 }),
  finalMilesSnapshot: decimal("final_miles_snapshot", { precision: 10, scale: 2 }),
  ratePerMileSnapshot: decimal("rate_per_mile_snapshot", { precision: 10, scale: 4 }),
  status: loadStatusEnum("status").notNull().default("DRAFT"),
  payrollWeekId: integer("payroll_week_id"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  documentUrl: text("document_url"),
  bolFileUrl: text("bol_file_url"),
  bolFileUrls: text("bol_file_urls").array(),
  bolUploadedAt: timestamp("bol_uploaded_at"),
  createdByDriver: boolean("created_by_driver").default(false),
  bolRawText: text("bol_raw_text"),
  bolParsed: boolean("bol_parsed").default(false),
  extractedPickupAddress: text("extracted_pickup_address"),
  extractedDeliveryAddress: text("extracted_delivery_address"),
  verifiedPickupAddress: text("verified_pickup_address"),
  verifiedDeliveryAddress: text("verified_delivery_address"),
  confidencePickup: decimal("confidence_pickup", { precision: 5, scale: 2 }),
  confidenceDelivery: decimal("confidence_delivery", { precision: 5, scale: 2 }),
  pickupCandidates: text("pickup_candidates").array(),
  deliveryCandidates: text("delivery_candidates").array(),
  pickupSourceLines: text("pickup_source_lines").array(),
  deliverySourceLines: text("delivery_source_lines").array(),
  needsManualDelivery: boolean("needs_manual_delivery").default(false),
  revenueAmount: decimal("revenue_amount", { precision: 10, scale: 2 }),
  revenueSource: text("revenue_source"),
  revenueRpmUsed: decimal("revenue_rpm_used", { precision: 10, scale: 4 }),
  revenueLastCalculatedAt: timestamp("revenue_last_calculated_at"),
  brokerName: text("broker_name"),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedByUserId: integer("deleted_by_user_id"),
  isVoided: boolean("is_voided").default(false),
  voidedAt: timestamp("voided_at"),
  voidedByUserId: integer("voided_by_user_id"),
  voidReason: text("void_reason"),
});

export const payItems = pgTable("pay_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverUserId: integer("driver_user_id").notNull().references(() => users.id),
  companyId: integer("company_id").references(() => companies.id),
  loadId: integer("load_id"),
  payrollWeekId: integer("payroll_week_id"),
  type: payItemTypeEnum("type").notNull(),
  category: payItemCategoryEnum("category").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  status: payItemStatusEnum("status").notNull().default("DRAFT"),
  createdBy: integer("created_by"),
  approvedBy: integer("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payrollWeeks = pgTable("payroll_weeks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  driverUserId: integer("driver_user_id").notNull().references(() => users.id),
  companyId: integer("company_id").references(() => companies.id),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  status: payrollStatusEnum("status").notNull().default("OPEN"),
  milesTotalSnapshot: decimal("miles_total_snapshot", { precision: 10, scale: 2 }),
  basePayTotal: decimal("base_pay_total", { precision: 10, scale: 2 }),
  earningsTotal: decimal("earnings_total", { precision: 10, scale: 2 }),
  deductionsTotal: decimal("deductions_total", { precision: 10, scale: 2 }),
  reimbursementsTotal: decimal("reimbursements_total", { precision: 10, scale: 2 }),
  netPayTotal: decimal("net_pay_total", { precision: 10, scale: 2 }),
  statementPdfUrl: text("statement_pdf_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invites = pgTable("invites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("DRIVER"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  acceptedAt: timestamp("accepted_at"),
  acceptedByUserId: integer("accepted_by_user_id"),
  revokedAt: timestamp("revoked_at"),
  revokedByUserId: integer("revoked_by_user_id"),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  remember: boolean("remember").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  actorId: integer("actor_id"),
  companyId: integer("company_id").references(() => companies.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companyCostItems = pgTable("company_cost_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  frequency: text("frequency").notNull().default("MONTHLY"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  employmentType: text("employment_type"),
  costScope: text("cost_scope").notNull().default("GLOBAL"),
  truckId: integer("truck_id").references(() => trucks.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const driverProfitabilityWeeks = pgTable("driver_profitability_weeks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  driverUserId: integer("driver_user_id").notNull().references(() => users.id),
  autoScore: text("auto_score").notNull(),
  overrideScore: text("override_score"),
  overrideReason: text("override_reason"),
  revenueTotal: decimal("revenue_total", { precision: 10, scale: 2 }).notNull().default("0"),
  driverPayTotal: decimal("driver_pay_total", { precision: 10, scale: 2 }).notNull().default("0"),
  companyCostTotal: decimal("company_cost_total", { precision: 10, scale: 2 }).notNull().default("0"),
  profitTotal: decimal("profit_total", { precision: 10, scale: 2 }).notNull().default("0"),
  profitPerMile: decimal("profit_per_mile", { precision: 10, scale: 4 }).notNull().default("0"),
  milesTotal: decimal("miles_total", { precision: 10, scale: 2 }).notNull().default("0"),
  loadsCount: integer("loads_count").notNull().default(0),
  missingRevenueCount: integer("missing_revenue_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
});

export const dispatcherTrucks = pgTable("dispatcher_trucks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  dispatcherUserId: integer("dispatcher_user_id").notNull().references(() => users.id),
  truckId: integer("truck_id").notNull().references(() => trucks.id),
});

// ── Select types (what the DB returns) ───────────────────────────────────
export type User = typeof users.$inferSelect;
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type Load = typeof loads.$inferSelect;
export type PayItem = typeof payItems.$inferSelect;
export type PayrollWeek = typeof payrollWeeks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Truck = typeof trucks.$inferSelect;
export type DispatcherTruck = typeof dispatcherTrucks.$inferSelect;
export type DriverProfitabilityWeek = typeof driverProfitabilityWeeks.$inferSelect;
export type CompanyCostItem = typeof companyCostItems.$inferSelect;

// ── Insert types (what storage methods accept) ────────────────────────────
// Defined explicitly rather than via $inferInsert to avoid drizzle-zod inference
// issues in environments where @types/node is not fully resolved at compile time.
export type InsertUser = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: "DRIVER" | "DISPATCHER" | "ADMIN" | "SUPERADMIN";
  companyId?: number | null;
  isActive?: boolean;
  deletedAt?: Date | null;
  dispatcherPayModel?: string | null;
  dispatcherPayRate?: string | null;
};
export type InsertDriverProfile = {
  userId: number;
  phone?: string | null;
  address?: string | null;
  cdlNumber?: string | null;
  cdlExpiration?: string | null;
  medicalExpiration?: string | null;
  ratePerMile?: string;
  employmentType?: "W2_COMPANY_DRIVER" | "N1099_COMPANY_DRIVER" | "OWNER_OPERATOR" | "LEASE_TO_PURCHASE";
  status?: "ACTIVE" | "INACTIVE";
  notes?: string | null;
  assignedDispatcherId?: number | null;
  assignedAt?: Date | null;
  assignedByUserId?: number | null;
  payModel?: string;
  revenueSharePercent?: string | null;
  flatFeeAmount?: string | null;
  fuelPaidBy?: string;
};
export type InsertLoad = {
  driverUserId: number;
  companyId?: number | null;
  truckId?: number | null;
  pickupAddress?: string | null;
  deliveryAddress?: string | null;
  pickupDate?: string | null;
  deliveryDate?: string | null;
  calculatedMiles?: string | null;
  adjustedMiles?: string | null;
  finalMiles?: string | null;
  status?: "DRAFT" | "BOL_UPLOADED" | "OCR_DONE" | "SUBMITTED" | "VERIFIED" | "APPROVED" | "LOCKED";
  brokerName?: string | null;
  bolFileUrl?: string | null;
  createdByDriver?: boolean | null;
};
export type InsertPayItem = {
  driverUserId: number;
  companyId?: number | null;
  loadId?: number | null;
  payrollWeekId?: number | null;
  type: "EARNING" | "DEDUCTION" | "REIMBURSEMENT";
  category: "EXTRA_STOP" | "LAYOVER" | "DETENTION" | "BREAKDOWN" | "INSPECTION_L1" | "INSPECTION_L2" | "INSPECTION_L3" | "SAFETY_BONUS" | "ESCROW" | "ADVANCE" | "FUEL" | "INSURANCE" | "OTHER";
  amount: string;
  description?: string | null;
  status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "LOCKED";
  createdBy?: number | null;
};
export type InsertPayrollWeek = {
  driverUserId: number;
  companyId?: number | null;
  weekStart: string;
  weekEnd: string;
  status?: "OPEN" | "REVIEW" | "APPROVED" | "PAID" | "LOCKED";
  milesTotalSnapshot?: string | null;
  basePayTotal?: string | null;
  earningsTotal?: string | null;
  deductionsTotal?: string | null;
  reimbursementsTotal?: string | null;
  netPayTotal?: string | null;
  statementPdfUrl?: string | null;
};
export type InsertCompany = {
  name: string;
  address?: string | null;
  phone?: string | null;
  timezone?: string | null;
  isActive?: boolean;
};
export type InsertCompanySettings = {
  companyId: number;
  allowAdminInvites?: boolean;
  dispatcherCanSeeUnassigned?: boolean;
  defaultRevenueMode?: string | null;
  defaultRevenueRpm?: string | null;
  defaultRevenueFlat?: string | null;
};
export type InsertInvite = {
  companyId: number;
  email: string;
  role?: "DRIVER" | "DISPATCHER" | "ADMIN" | "SUPERADMIN";
  tokenHash: string;
  expiresAt: Date;
  createdByUserId: number;
};
export type InsertTruck = {
  companyId: number;
  truckNumber: string;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  ownershipType?: string;
  purchasePrice?: string | null;
  monthlyPayment?: string | null;
  insuranceMonthly?: string | null;
  maintenanceReserve?: string | null;
  eldCost?: string | null;
  status?: string;
  notes?: string | null;
};
export type InsertDispatcherTruck = {
  companyId: number;
  dispatcherUserId: number;
  truckId: number;
};
export type InsertDriverProfitabilityWeek = {
  companyId: number;
  weekStart: string;
  weekEnd: string;
  driverUserId: number;
  autoScore: string;
  overrideScore?: string | null;
  overrideReason?: string | null;
  revenueTotal?: string;
  driverPayTotal?: string;
  companyCostTotal?: string;
  profitTotal?: string;
  profitPerMile?: string;
  milesTotal?: string;
  loadsCount?: number;
  missingRevenueCount?: number;
  updatedByUserId?: number | null;
};
export type InsertCompanyCostItem = {
  companyId: number;
  name: string;
  frequency?: string;
  amount: string;
  enabled?: boolean;
  employmentType?: string | null;
  costScope?: string;
  truckId?: number | null;
};

// ── Zod schemas (used for route validation only) ──────────────────────────
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional().default(false),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["DRIVER", "DISPATCHER", "ADMIN"]).optional(),
});
