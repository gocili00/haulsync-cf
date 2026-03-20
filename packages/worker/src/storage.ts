import { eq, and, desc, sql, gte, lte, inArray, or, ilike, count as drizzleCount } from "drizzle-orm";
import type { Db } from "./db";
import {
  users, driverProfiles, loads, payItems, payrollWeeks, auditLogs, companies, invites, companySettings, driverProfitabilityWeeks, companyCostItems, trucks, dispatcherTrucks,
  type User, type InsertUser, type DriverProfile, type InsertDriverProfile,
  type Load, type InsertLoad, type PayItem, type InsertPayItem,
  type PayrollWeek, type InsertPayrollWeek, type AuditLog,
  type Company, type InsertCompany, type Invite, type InsertInvite,
  type CompanySettings, type InsertCompanySettings,
  type DriverProfitabilityWeek, type InsertDriverProfitabilityWeek,
  type CompanyCostItem, type InsertCompanyCostItem,
  type Truck, type InsertTruck,
  type DispatcherTruck, type InsertDispatcherTruck,
} from "@haulsync/shared";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(companyId?: number): Promise<User[]>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  softDeleteUser(id: number): Promise<User | undefined>;
  getDriverProfile(userId: number): Promise<DriverProfile | undefined>;
  createDriverProfile(profile: InsertDriverProfile): Promise<DriverProfile>;
  updateDriverProfile(userId: number, data: Partial<InsertDriverProfile>): Promise<DriverProfile | undefined>;
  getDriversWithProfiles(companyId?: number): Promise<any[]>;
  getDriversWithProfilesPaginated(options: { companyId?: number; driverUserIds?: number[]; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  getDispatchersByCompany(companyId: number): Promise<any[]>;
  getLoads(driverUserId?: number, companyId?: number, includeDeletedVoided?: boolean, filters?: { dispatcherId?: number; driverIdFilter?: number }): Promise<any[]>;
  getLoadsPaginated(options: { companyId?: number; driverUserId?: number; driverUserIds?: number[]; search?: string; status?: string; includeDeletedVoided?: boolean; dispatcherId?: number; driverIdFilter?: number; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  getDriverUserIdsForDispatcher(dispatcherId: number, companyId: number, includeUnassigned?: boolean): Promise<number[]>;
  getPayItem(id: number): Promise<PayItem | undefined>;
  getLoad(id: number): Promise<Load | undefined>;
  createLoad(load: InsertLoad): Promise<Load>;
  updateLoad(id: number, data: Partial<InsertLoad>): Promise<Load | undefined>;
  getPayItems(driverUserId?: number, companyId?: number): Promise<any[]>;
  getPayItemsPaginated(options: { companyId?: number; driverUserId?: number; driverUserIds?: number[]; search?: string; type?: string; status?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  getPayItemsGroupedByDriver(options: { companyId?: number; driverUserIds?: number[]; search?: string; type?: string; status?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  createPayItem(item: InsertPayItem): Promise<PayItem>;
  updatePayItem(id: number, data: Partial<InsertPayItem> & { approvedBy?: number | null }): Promise<PayItem | undefined>;
  getPayrollWeeks(driverUserId?: number, companyId?: number): Promise<any[]>;
  getPayrollWeeksPaginated(options: {
    companyId?: number;
    driverUserId?: number;
    driverUserIds?: number[];
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: any[]; total: number; driverCount: number }>;
  getPayrollWeek(id: number): Promise<PayrollWeek | undefined>;
  createPayrollWeek(week: InsertPayrollWeek): Promise<PayrollWeek>;
  updatePayrollWeek(id: number, data: Partial<InsertPayrollWeek>): Promise<PayrollWeek | undefined>;
  createAuditLog(log: { actorId?: number; companyId?: number; action: string; entity: string; entityId?: number; before?: any; after?: any; ip?: string; metadata?: any }): Promise<AuditLog>;
  getAuditLogs(companyId?: number, filters?: { action?: string; actorId?: number; entityId?: number; limit?: number; offset?: number; excludeSuperadmin?: boolean }): Promise<any[]>;
  getAllInvites(): Promise<Invite[]>;
  getCompanyDetailStats(companyId: number): Promise<any>;
  getDashboardStats(userId: number, role: string, companyId?: number): Promise<any>;
  getAdminStats(companyId?: number): Promise<any>;
  getApprovedLoadsForWeek(driverUserId: number, weekStart: string, weekEnd: string): Promise<Load[]>;
  getApprovedPayItemsForWeek(driverUserId: number, weekStart: string, weekEnd: string): Promise<PayItem[]>;
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  getAllCompanies(): Promise<Company[]>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined>;
  getCompanyUsers(companyId: number): Promise<User[]>;
  getSuperAdminStats(): Promise<any>;
  updateLoadOcr(id: number, data: any): Promise<Load | undefined>;
  createInvite(invite: InsertInvite): Promise<Invite>;
  getInvite(id: number): Promise<Invite | undefined>;
  getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined>;
  getInvitesByCompany(companyId: number): Promise<Invite[]>;
  getTeamUsersPaginated(options: { companyId?: number; visibleRoles: string[]; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  getInvitesPaginated(options: { companyId: number; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }>;
  updateInvite(id: number, data: Partial<Invite>): Promise<Invite | undefined>;
  getCompanySettings(companyId: number): Promise<CompanySettings | undefined>;
  upsertCompanySettings(companyId: number, data: Partial<InsertCompanySettings>): Promise<CompanySettings>;
  getProfitabilityForWeek(companyId: number, weekStart: string, weekEnd: string): Promise<DriverProfitabilityWeek[]>;
  getProfitabilityRow(companyId: number, driverUserId: number, weekStart: string): Promise<DriverProfitabilityWeek | undefined>;
  upsertProfitabilityRow(data: InsertDriverProfitabilityWeek): Promise<DriverProfitabilityWeek>;
  getLoadsForDriverWeek(driverUserId: number, companyId: number, weekStart: string, weekEnd: string): Promise<Load[]>;
  getPayItemsForDriverWeek(driverUserId: number, companyId: number, weekStart: string, weekEnd: string): Promise<PayItem[]>;
  getLoadsForCompanyDateRange(companyId: number, startDate: string, endDate: string): Promise<Load[]>;
  getPayItemsForCompanyDateRange(companyId: number, startDate: string, endDate: string): Promise<PayItem[]>;
  getAggregatedProfitabilityForRange(companyId: number, startDate: string, endDate: string): Promise<any[]>;
  getCompanyCostItems(companyId: number): Promise<CompanyCostItem[]>;
  getCompanyCostItemsPaginated(companyId: number, search?: string, limit?: number, offset?: number): Promise<{ items: CompanyCostItem[]; total: number }>;
  getCompanyCostItem(id: number, companyId: number): Promise<CompanyCostItem | undefined>;
  createCompanyCostItem(data: InsertCompanyCostItem): Promise<CompanyCostItem>;
  updateCompanyCostItem(id: number, companyId: number, data: Partial<InsertCompanyCostItem>): Promise<CompanyCostItem | undefined>;
  deleteCompanyCostItem(id: number, companyId: number): Promise<boolean>;
  getEnabledCompanyCostItems(companyId: number): Promise<CompanyCostItem[]>;
  getTrucks(companyId: number): Promise<Truck[]>;
  getTruck(id: number, companyId: number): Promise<Truck | undefined>;
  createTruck(data: InsertTruck): Promise<Truck>;
  updateTruck(id: number, companyId: number, data: Partial<InsertTruck>): Promise<Truck | undefined>;
  deleteTruck(id: number, companyId: number): Promise<boolean>;
  getDispatcherTrucks(companyId: number, dispatcherUserId?: number): Promise<DispatcherTruck[]>;
  addDispatcherTruck(data: InsertDispatcherTruck): Promise<DispatcherTruck>;
  removeDispatcherTruck(id: number, companyId: number): Promise<boolean>;
  getTrucksForDispatcher(companyId: number, dispatcherUserId: number): Promise<Truck[]>;
  getDispatcherPerformance(dispatcherId: number, companyId: number, startDate?: string, endDate?: string): Promise<any>;
  updateDispatcherPay(dispatcherId: number, companyId: number, payModel: string, payRate: number): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await this.db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers(companyId?: number): Promise<User[]> {
    if (companyId) {
      return this.db.select().from(users).where(and(eq(users.companyId, companyId), sql`${users.deletedAt} IS NULL`)).orderBy(users.id);
    }
    return this.db.select().from(users).where(sql`${users.deletedAt} IS NULL`).orderBy(users.id);
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await this.db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async softDeleteUser(id: number): Promise<User | undefined> {
    const [updated] = await this.db.update(users).set({ deletedAt: new Date(), isActive: false } as any).where(eq(users.id, id)).returning();
    return updated;
  }

  async getDriverProfile(userId: number): Promise<DriverProfile | undefined> {
    const [profile] = await this.db.select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
    return profile;
  }

  async createDriverProfile(profile: InsertDriverProfile): Promise<DriverProfile> {
    const [created] = await this.db.insert(driverProfiles).values(profile).returning();
    return created;
  }

  async updateDriverProfile(userId: number, data: Partial<InsertDriverProfile>): Promise<DriverProfile | undefined> {
    const [updated] = await this.db.update(driverProfiles).set(data).where(eq(driverProfiles.userId, userId)).returning();
    return updated;
  }

  private async _enrichDriversWithLastTruck(driverIds: number[], companyId?: number): Promise<Map<number, string | null>> {
    if (driverIds.length === 0) return new Map();
    const companyFilter = companyId ? sql`AND l.company_id = ${companyId}` : sql``;
    const rows = await this.db.execute(sql`
      SELECT DISTINCT ON (l.driver_user_id)
        l.driver_user_id,
        t.truck_number
      FROM loads l
      JOIN trucks t ON t.id = l.truck_id
      WHERE l.driver_user_id = ANY(${sql.raw(`ARRAY[${driverIds.join(",")}]`)})
        AND l.truck_id IS NOT NULL
        AND l.is_deleted = false
        AND l.is_voided = false
        ${companyFilter}
      ORDER BY l.driver_user_id, l.pickup_date DESC, l.id DESC
    `);
    const m = new Map<number, string | null>();
    for (const r of rows as any[]) {
      m.set(Number(r.driver_user_id), r.truck_number as string);
    }
    return m;
  }

  async getDriversWithProfiles(companyId?: number): Promise<any[]> {
    let query;
    if (companyId) {
      query = await this.db.select().from(users).where(and(eq(users.role, "DRIVER"), eq(users.companyId, companyId), sql`${users.deletedAt} IS NULL`)).orderBy(users.id);
    } else {
      query = await this.db.select().from(users).where(and(eq(users.role, "DRIVER"), sql`${users.deletedAt} IS NULL`)).orderBy(users.id);
    }
    const driverIds = query.map((u) => u.id);
    const lastTruckMap = await this._enrichDriversWithLastTruck(driverIds, companyId);
    const results = [];
    for (const u of query) {
      const profile = await this.getDriverProfile(u.id);
      let assignedDispatcherName: string | undefined;
      if (profile?.assignedDispatcherId) {
        const dispatcher = await this.getUser(profile.assignedDispatcherId);
        if (dispatcher) assignedDispatcherName = `${dispatcher.firstName} ${dispatcher.lastName}`;
      }
      results.push({ ...u, profile, assignedDispatcherName, lastTruckNumber: lastTruckMap.get(u.id) ?? null, passwordHash: undefined });
    }
    return results;
  }

  async getDriversWithProfilesPaginated(options: { companyId?: number; driverUserIds?: number[]; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [eq(users.role, "DRIVER"), sql`${users.deletedAt} IS NULL`];
    if (options.companyId) conditions.push(eq(users.companyId, options.companyId));
    if (options.driverUserIds && options.driverUserIds.length > 0) {
      conditions.push(inArray(users.id, options.driverUserIds));
    }
    if (options.search) {
      const p = `%${options.search}%`;
      conditions.push(or(ilike(users.firstName, p), ilike(users.lastName, p), ilike(users.email, p), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p)));
    }
    const whereClause = and(...conditions);
    const [{ value: total }] = await this.db.select({ value: drizzleCount() }).from(users).where(whereClause);
    const rows = await this.db.select().from(users).where(whereClause).orderBy(users.id).limit(options.limit).offset(options.offset);
    const driverIds = rows.map((u) => u.id);
    const lastTruckMap = await this._enrichDriversWithLastTruck(driverIds, options.companyId);
    const items = [];
    for (const u of rows) {
      const profile = await this.getDriverProfile(u.id);
      let assignedDispatcherName: string | undefined;
      if (profile?.assignedDispatcherId) {
        const dispatcher = await this.getUser(profile.assignedDispatcherId);
        if (dispatcher) assignedDispatcherName = `${dispatcher.firstName} ${dispatcher.lastName}`;
      }
      items.push({ ...u, profile, assignedDispatcherName, lastTruckNumber: lastTruckMap.get(u.id) ?? null, passwordHash: undefined });
    }
    return { items, total: Number(total) };
  }

  async getDispatchersByCompany(companyId: number): Promise<any[]> {
    const dispatchers = await this.db.select().from(users).where(and(eq(users.role, "DISPATCHER"), eq(users.companyId, companyId), eq(users.isActive, true))).orderBy(users.id);
    return dispatchers.map(d => ({ ...d, passwordHash: undefined }));
  }

  async getDriverUserIdsForDispatcher(dispatcherId: number, companyId: number, includeUnassigned?: boolean): Promise<number[]> {
    const companyDrivers = await this.db.select({ userId: users.id })
      .from(users)
      .where(and(eq(users.role, "DRIVER"), eq(users.companyId, companyId)));
    const companyDriverIds = new Set(companyDrivers.map(d => d.userId));

    const profiles = await this.db.select().from(driverProfiles)
  .where(inArray(driverProfiles.userId, [...companyDriverIds]));
    const ids: number[] = [];
    for (const p of profiles) {
      if (!companyDriverIds.has(p.userId)) continue;
      if (p.assignedDispatcherId === dispatcherId) {
        ids.push(p.userId);
      } else if (includeUnassigned && !p.assignedDispatcherId) {
        ids.push(p.userId);
      }
    }
    return ids;
  }

  async getPayItem(id: number): Promise<PayItem | undefined> {
    const [item] = await this.db.select().from(payItems).where(eq(payItems.id, id));
    return item;
  }

  async getLoads(driverUserId?: number, companyId?: number, includeDeletedVoided?: boolean, filters?: { dispatcherId?: number; driverIdFilter?: number }): Promise<any[]> {
    let conditions: any[] = [];
    if (driverUserId) conditions.push(eq(loads.driverUserId, driverUserId));
    if (companyId) conditions.push(eq(loads.companyId, companyId));
    if (!includeDeletedVoided) {
      conditions.push(eq(loads.isDeleted, false));
      conditions.push(eq(loads.isVoided, false));
    }
    if (filters?.driverIdFilter) {
      conditions.push(eq(loads.driverUserId, filters.driverIdFilter));
    }

    let query;
    if (conditions.length > 0) {
      query = await this.db.select().from(loads).where(and(...conditions)).orderBy(desc(loads.createdAt));
    } else {
      query = await this.db.select().from(loads).orderBy(desc(loads.createdAt));
    }

    let filteredByDispatcher = query;
    if (filters?.dispatcherId) {
      const driverProfs = await this.db.select().from(driverProfiles).where(eq(driverProfiles.assignedDispatcherId, filters.dispatcherId));
      const assignedDriverIds = new Set(driverProfs.map(p => p.userId));
      filteredByDispatcher = query.filter(l => assignedDriverIds.has(l.driverUserId));
    }

    const results = [];
    for (const l of filteredByDispatcher) {
      const driver = await this.getUser(l.driverUserId);
      const driverProfile = driver ? await this.getDriverProfile(driver.id) : null;
      let assignedDispatcherName: string | undefined;
      if (driverProfile?.assignedDispatcherId) {
        const disp = await this.getUser(driverProfile.assignedDispatcherId);
        if (disp) assignedDispatcherName = `${disp.firstName} ${disp.lastName}`;
      }
      results.push({
        ...l,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined,
        assignedDispatcherName,
        assignedDispatcherId: driverProfile?.assignedDispatcherId,
      });
    }
    return results;
  }

  async getLoadsPaginated(options: {
    companyId?: number; driverUserId?: number; driverUserIds?: number[];
    search?: string; status?: string; includeDeletedVoided?: boolean;
    dispatcherId?: number; driverIdFilter?: number; limit: number; offset: number;
  }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [];
    if (options.companyId) conditions.push(eq(loads.companyId, options.companyId));
    if (options.driverUserId) conditions.push(eq(loads.driverUserId, options.driverUserId));
    if (options.driverIdFilter) conditions.push(eq(loads.driverUserId, options.driverIdFilter));
    if (!options.includeDeletedVoided) {
      conditions.push(eq(loads.isDeleted, false));
      conditions.push(eq(loads.isVoided, false));
    }
    if (options.status) conditions.push(eq(loads.status, options.status as any));

    let scopedDriverIds: number[] | undefined;
    if (options.driverUserIds && options.driverUserIds.length > 0) {
      scopedDriverIds = options.driverUserIds;
    }
    if (options.dispatcherId) {
      const driverProfs = await this.db.select().from(driverProfiles).where(eq(driverProfiles.assignedDispatcherId, options.dispatcherId));
      const assignedIds = driverProfs.map(p => p.userId);
      if (scopedDriverIds) {
        scopedDriverIds = scopedDriverIds.filter(id => assignedIds.includes(id));
      } else {
        scopedDriverIds = assignedIds;
      }
    }
    if (scopedDriverIds) {
      if (scopedDriverIds.length === 0) return { items: [], total: 0 };
      conditions.push(inArray(loads.driverUserId, scopedDriverIds));
    }

    if (options.search) {
      const p = `%${options.search}%`;
      const matchingUserIds = await this.db.select({ id: users.id }).from(users).where(
        and(eq(users.role, "DRIVER"), options.companyId ? eq(users.companyId, options.companyId) : undefined,
          or(ilike(users.firstName, p), ilike(users.lastName, p), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p)))
      );
      const driverSearchIds = matchingUserIds.map(u => u.id);
      conditions.push(or(
        ilike(loads.pickupAddress, p),
        ilike(loads.deliveryAddress, p),
        ilike(loads.brokerName, p),
        driverSearchIds.length > 0 ? inArray(loads.driverUserId, driverSearchIds) : sql`false`,
      ));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ value: total }] = await this.db.select({ value: drizzleCount() }).from(loads).where(whereClause);
    const rows = await this.db.select().from(loads).where(whereClause).orderBy(desc(loads.createdAt)).limit(options.limit).offset(options.offset);

    // Bulk truck lookup to avoid N+1
    const truckIdSet = new Set(rows.map((l) => l.truckId).filter(Boolean) as number[]);
    const truckMap = new Map<number, string>();
    if (truckIdSet.size > 0) {
      const truckRows = await this.db.select({ id: trucks.id, truckNumber: trucks.truckNumber })
        .from(trucks).where(inArray(trucks.id, [...truckIdSet]));
      for (const t of truckRows) truckMap.set(t.id, t.truckNumber);
    }

    const items = [];
    for (const l of rows) {
      const driver = await this.getUser(l.driverUserId);
      const driverProfile = driver ? await this.getDriverProfile(driver.id) : null;
      let assignedDispatcherName: string | undefined;
      if (driverProfile?.assignedDispatcherId) {
        const disp = await this.getUser(driverProfile.assignedDispatcherId);
        if (disp) assignedDispatcherName = `${disp.firstName} ${disp.lastName}`;
      }
      const truckNumber = l.truckId ? (truckMap.get(l.truckId) ?? null) : null;
      items.push({ ...l, driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined, assignedDispatcherName, assignedDispatcherId: driverProfile?.assignedDispatcherId, truckNumber });
    }
    return { items, total: Number(total) };
  }

  async getLoad(id: number): Promise<Load | undefined> {
    const [load] = await this.db.select().from(loads).where(eq(loads.id, id)).limit(1);
    return load;
  }

  async createLoad(load: InsertLoad): Promise<Load> {
    const [created] = await this.db.insert(loads).values(load).returning();
    return created;
  }

  async updateLoad(id: number, data: Partial<InsertLoad>): Promise<Load | undefined> {
    const [updated] = await this.db.update(loads).set(data).where(eq(loads.id, id)).returning();
    return updated;
  }

  async getPayItems(driverUserId?: number, companyId?: number): Promise<any[]> {
    let conditions: any[] = [];
    if (driverUserId) conditions.push(eq(payItems.driverUserId, driverUserId));
    if (companyId) conditions.push(eq(payItems.companyId, companyId));

    let query;
    if (conditions.length > 0) {
      query = await this.db.select().from(payItems).where(and(...conditions)).orderBy(desc(payItems.createdAt));
    } else {
      query = await this.db.select().from(payItems).orderBy(desc(payItems.createdAt));
    }
    const results = [];
    for (const pi of query) {
      const driver = await this.getUser(pi.driverUserId);
      results.push({
        ...pi,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined,
      });
    }
    return results;
  }

  async getPayItemsPaginated(options: {
    companyId?: number; driverUserId?: number; driverUserIds?: number[];
    search?: string; type?: string; status?: string; limit: number; offset: number;
  }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [];
    if (options.companyId) conditions.push(eq(payItems.companyId, options.companyId));
    if (options.driverUserId) conditions.push(eq(payItems.driverUserId, options.driverUserId));
    if (options.driverUserIds && options.driverUserIds.length > 0) {
      conditions.push(inArray(payItems.driverUserId, options.driverUserIds));
    }
    if (options.type) conditions.push(eq(payItems.type, options.type as any));
    if (options.status) conditions.push(eq(payItems.status, options.status as any));
    if (options.search) {
      const p = `%${options.search}%`;
      const matchingUserIds = await this.db.select({ id: users.id }).from(users).where(
        and(eq(users.role, "DRIVER"), options.companyId ? eq(users.companyId, options.companyId) : undefined,
          or(ilike(users.firstName, p), ilike(users.lastName, p), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p)))
      );
      const driverSearchIds = matchingUserIds.map(u => u.id);
      conditions.push(or(
        ilike(payItems.description, p),
        ilike(payItems.category, p),
        driverSearchIds.length > 0 ? inArray(payItems.driverUserId, driverSearchIds) : sql`false`,
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ value: total }] = await this.db.select({ value: drizzleCount() }).from(payItems).where(whereClause);
    const rows = await this.db.select().from(payItems).where(whereClause).orderBy(desc(payItems.createdAt)).limit(options.limit).offset(options.offset);
    const items = [];
    for (const pi of rows) {
      const driver = await this.getUser(pi.driverUserId);
      items.push({ ...pi, driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined });
    }
    return { items, total: Number(total) };
  }

  async getPayItemsGroupedByDriver(options: {
    companyId?: number; driverUserIds?: number[];
    search?: string; type?: string; status?: string; limit: number; offset: number;
  }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [];
    if (options.companyId) conditions.push(eq(payItems.companyId, options.companyId));
    if (options.driverUserIds && options.driverUserIds.length > 0) {
      conditions.push(inArray(payItems.driverUserId, options.driverUserIds));
    }
    if (options.type) conditions.push(eq(payItems.type, options.type as any));
    if (options.status) conditions.push(eq(payItems.status, options.status as any));
    if (options.search) {
      const p = `%${options.search}%`;
      const matchingUserIds = await this.db.select({ id: users.id }).from(users).where(
        and(eq(users.role, "DRIVER"), options.companyId ? eq(users.companyId, options.companyId) : undefined,
          or(ilike(users.firstName, p), ilike(users.lastName, p), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p)))
      );
      const driverSearchIds = matchingUserIds.map(u => u.id);
      conditions.push(or(
        ilike(payItems.description, p),
        ilike(payItems.category, p),
        driverSearchIds.length > 0 ? inArray(payItems.driverUserId, driverSearchIds) : sql`false`,
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const distinctDrivers = await this.db.selectDistinct({ driverUserId: payItems.driverUserId })
      .from(payItems).where(whereClause);
    const totalDrivers = distinctDrivers.length;

    const driverNameMap: Record<number, string> = {};
    for (const dd of distinctDrivers) {
      const u = await this.getUser(dd.driverUserId);
      driverNameMap[dd.driverUserId] = u ? `${u.firstName} ${u.lastName}` : "Unknown";
    }
    const sortedDriverIds = distinctDrivers
      .map(d => d.driverUserId)
      .sort((a, b) => (driverNameMap[a] || "").localeCompare(driverNameMap[b] || ""));

    const pagedDriverIds = sortedDriverIds.slice(options.offset, options.offset + options.limit);

    if (pagedDriverIds.length === 0) {
      return { items: [], total: totalDrivers };
    }

    const rows = await this.db.select().from(payItems)
      .where(and(whereClause, inArray(payItems.driverUserId, pagedDriverIds)))
      .orderBy(desc(payItems.createdAt));

    const items = rows.map(pi => ({
      ...pi,
      driverName: driverNameMap[pi.driverUserId],
    }));

    return { items, total: totalDrivers };
  }

  async createPayItem(item: InsertPayItem): Promise<PayItem> {
    const [created] = await this.db.insert(payItems).values(item).returning();
    return created;
  }

  async updatePayItem(id: number, data: Partial<InsertPayItem> & { approvedBy?: number | null }): Promise<PayItem | undefined> {
    const [updated] = await this.db.update(payItems).set(data).where(eq(payItems.id, id)).returning();
    return updated;
  }

  async getPayrollWeeks(driverUserId?: number, companyId?: number): Promise<any[]> {
    let conditions: any[] = [];
    if (driverUserId) conditions.push(eq(payrollWeeks.driverUserId, driverUserId));
    if (companyId) conditions.push(eq(payrollWeeks.companyId, companyId));

    let query;
    if (conditions.length > 0) {
      query = await this.db.select().from(payrollWeeks).where(and(...conditions)).orderBy(desc(payrollWeeks.createdAt));
    } else {
      query = await this.db.select().from(payrollWeeks).orderBy(desc(payrollWeeks.createdAt));
    }
    const results = [];
    for (const pw of query) {
      const driver = await this.getUser(pw.driverUserId);
      const profile = driver ? await this.getDriverProfile(driver.id) : null;
      results.push({
        ...pw,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined,
        employmentType: profile?.employmentType || "W2_COMPANY_DRIVER",
      });
    }
    return results;
  }

  async getPayrollWeeksPaginated(options: {
    companyId?: number;
    driverUserId?: number;
    driverUserIds?: number[];
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: any[]; total: number; driverCount: number }> {
    let driverScope: number[] | undefined;
    if (options.driverUserId) {
      driverScope = [options.driverUserId];
    } else if (options.driverUserIds && options.driverUserIds.length > 0) {
      driverScope = options.driverUserIds;
    }

    if (options.search) {
      const pattern = `%${options.search}%`;
      const matchingUsers = await this.db.select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "DRIVER"),
            options.companyId ? eq(users.companyId, options.companyId) : undefined,
            or(
              ilike(users.firstName, pattern),
              ilike(users.lastName, pattern),
              ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, pattern),
            ),
          ),
        );
      const searchIds = new Set(matchingUsers.map(u => u.id));
      if (driverScope) {
        driverScope = driverScope.filter(id => searchIds.has(id));
      } else {
        driverScope = [...searchIds];
      }
      if (driverScope.length === 0) {
        return { items: [], total: 0, driverCount: 0 };
      }
    }

    const conditions: any[] = [];
    if (options.companyId) conditions.push(eq(payrollWeeks.companyId, options.companyId));
    if (driverScope && driverScope.length > 0) {
      conditions.push(inArray(payrollWeeks.driverUserId, driverScope));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ value: total }] = await this.db.select({ value: drizzleCount() })
      .from(payrollWeeks)
      .where(whereClause);

    const [{ value: driverCount }] = await this.db.select({ value: sql<number>`COUNT(DISTINCT ${payrollWeeks.driverUserId})` })
      .from(payrollWeeks)
      .where(whereClause);

    const rows = await this.db.select().from(payrollWeeks)
      .where(whereClause)
      .orderBy(desc(payrollWeeks.weekStart), desc(payrollWeeks.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    const items = [];
    for (const pw of rows) {
      const driver = await this.getUser(pw.driverUserId);
      const profile = driver ? await this.getDriverProfile(driver.id) : null;
      items.push({
        ...pw,
        driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined,
        employmentType: profile?.employmentType || "W2_COMPANY_DRIVER",
      });
    }

    return { items, total: Number(total), driverCount: Number(driverCount) };
  }

  async getPayrollWeek(id: number): Promise<PayrollWeek | undefined> {
    const [week] = await this.db.select().from(payrollWeeks).where(eq(payrollWeeks.id, id)).limit(1);
    return week;
  }

  async createPayrollWeek(week: InsertPayrollWeek): Promise<PayrollWeek> {
    const [created] = await this.db.insert(payrollWeeks).values(week).returning();
    return created;
  }

  async updatePayrollWeek(id: number, data: Partial<InsertPayrollWeek>): Promise<PayrollWeek | undefined> {
    const [updated] = await this.db.update(payrollWeeks).set(data).where(eq(payrollWeeks.id, id)).returning();
    return updated;
  }

  async createAuditLog(log: { actorId?: number; companyId?: number; action: string; entity: string; entityId?: number; before?: any; after?: any; ip?: string; metadata?: any }): Promise<AuditLog> {
    const [created] = await this.db.insert(auditLogs).values(log as any).returning();
    return created;
  }

  async getAuditLogs(companyId?: number, filters?: { action?: string; actorId?: number; entityId?: number; limit?: number; offset?: number; excludeSuperadmin?: boolean }): Promise<any[]> {
    let conditions: any[] = [];
    if (companyId) conditions.push(eq(auditLogs.companyId, companyId));
    if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters?.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
    if (filters?.entityId) conditions.push(eq(auditLogs.entityId, filters.entityId));

    const limit = filters?.limit || 200;
    const offset = filters?.offset || 0;

    let query;
    if (conditions.length > 0) {
      query = await this.db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
    } else {
      query = await this.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
    }
    const results = [];
    for (const log of query) {
      const actor = log.actorId ? await this.getUser(log.actorId) : null;
      if (filters?.excludeSuperadmin && actor?.role === "SUPERADMIN") continue;
      const company = log.companyId ? await this.getCompany(log.companyId) : null;
      results.push({
        ...log,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : undefined,
        actorRole: actor?.role,
        companyName: company?.name,
      });
    }
    return results;
  }

  async getAllInvites(): Promise<Invite[]> {
    return this.db.select().from(invites).orderBy(desc(invites.createdAt));
  }

  async getCompanyDetailStats(companyId: number): Promise<any> {
    const companyUsers = await this.getCompanyUsers(companyId);
    const drivers = companyUsers.filter(u => u.role === "DRIVER");
    const dispatchers = companyUsers.filter(u => u.role === "DISPATCHER");
    const admins = companyUsers.filter(u => u.role === "ADMIN");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

    const allLoads = await this.db.select().from(loads).where(eq(loads.companyId, companyId));
    const recentLoads = allLoads.filter(l => l.createdAt && new Date(l.createdAt) >= thirtyDaysAgo);
    const activeLoads = allLoads.filter(l => !l.isDeleted && !l.isVoided);

    const allPayroll = await this.db.select().from(payrollWeeks).where(eq(payrollWeeks.companyId, companyId));
    const totalPayroll = allPayroll.reduce((sum, pw) => sum + Number(pw.netPayTotal || 0), 0);

    const statementsGenerated = allPayroll.filter(pw => pw.statementPdfUrl).length;

    return {
      totalUsers: companyUsers.length,
      totalDrivers: drivers.length,
      totalDispatchers: dispatchers.length,
      totalAdmins: admins.length,
      totalLoads: activeLoads.length,
      recentLoads: recentLoads.length,
      totalPayrollWeeks: allPayroll.length,
      totalPayroll,
      statementsGenerated,
    };
  }

  async getDashboardStats(userId: number, role: string, companyId?: number): Promise<any> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const weekStartStr = monday.toISOString().split("T")[0];
    const weekEndStr = sunday.toISOString().split("T")[0];

    let allLoads: Load[];
    let allPayItems: PayItem[];

    if (role === "DRIVER") {
      allLoads = await this.db.select().from(loads).where(and(eq(loads.driverUserId, userId), eq(loads.isDeleted, false), eq(loads.isVoided, false)));
      allPayItems = await this.db.select().from(payItems).where(eq(payItems.driverUserId, userId));
    } else if (companyId) {
      allLoads = await this.db.select().from(loads).where(and(eq(loads.companyId, companyId), eq(loads.isDeleted, false), eq(loads.isVoided, false)));
      allPayItems = await this.db.select().from(payItems).where(eq(payItems.companyId, companyId));
    } else {
      allLoads = await this.db.select().from(loads).where(and(eq(loads.isDeleted, false), eq(loads.isVoided, false)));
      allPayItems = await this.db.select().from(payItems);
    }

    const weekLoads = allLoads.filter(l => l.pickupDate && l.pickupDate >= weekStartStr && l.pickupDate <= weekEndStr);
    const weekMiles = weekLoads.reduce((sum, l) => sum + Number(l.finalMiles || l.calculatedMiles || 0), 0);

    const pendingLoads = allLoads.filter(l => l.status === "DRAFT" || l.status === "SUBMITTED" || l.status === "BOL_UPLOADED" || l.status === "OCR_DONE").length;
    const pendingApprovals = allLoads.filter(l => l.status === "SUBMITTED" || l.status === "VERIFIED" || l.status === "BOL_UPLOADED" || l.status === "OCR_DONE").length +
      allPayItems.filter(pi => pi.status === "SUBMITTED").length;

    let weekPayrolls;
    if (role === "DRIVER") {
      weekPayrolls = await this.db.select().from(payrollWeeks).where(
        and(eq(payrollWeeks.driverUserId, userId), eq(payrollWeeks.weekStart, weekStartStr))
      );
    } else if (companyId) {
      weekPayrolls = await this.db.select().from(payrollWeeks).where(
        and(eq(payrollWeeks.companyId, companyId), eq(payrollWeeks.weekStart, weekStartStr))
      );
    } else {
      weekPayrolls = await this.db.select().from(payrollWeeks).where(eq(payrollWeeks.weekStart, weekStartStr));
    }

    const weekPay = weekPayrolls.reduce((sum, pw) => sum + Number(pw.netPayTotal || 0), 0);

    return { weekMiles: Math.round(weekMiles), weekPay, pendingLoads, pendingApprovals };
  }

  async getAdminStats(companyId?: number): Promise<any> {
    let allUsers, activeDrivers, allLoads, allPayroll;
    if (companyId) {
      allUsers = await this.db.select().from(users).where(eq(users.companyId, companyId));
      const companyDrivers = allUsers.filter(u => u.role === "DRIVER");
      const profiles = [];
      for (const d of companyDrivers) {
        const p = await this.getDriverProfile(d.id);
        if (p && p.status === "ACTIVE") profiles.push(p);
      }
      activeDrivers = profiles;
      allLoads = await this.db.select().from(loads).where(and(eq(loads.companyId, companyId), eq(loads.isDeleted, false), eq(loads.isVoided, false)));
      allPayroll = await this.db.select().from(payrollWeeks).where(eq(payrollWeeks.companyId, companyId));
    } else {
      allUsers = await this.db.select().from(users);
      activeDrivers = await this.db.select().from(driverProfiles).where(eq(driverProfiles.status, "ACTIVE"));
      allLoads = await this.db.select().from(loads).where(and(eq(loads.isDeleted, false), eq(loads.isVoided, false)));
      allPayroll = await this.db.select().from(payrollWeeks);
    }
    const totalPayroll = allPayroll.reduce((sum, pw) => sum + Number(pw.netPayTotal || 0), 0);

    return {
      totalUsers: allUsers.length,
      activeDrivers: activeDrivers.length,
      totalLoads: allLoads.length,
      totalPayroll,
    };
  }

  async getApprovedLoadsForWeek(driverUserId: number, weekStart: string, weekEnd: string): Promise<Load[]> {
    return this.db.select().from(loads).where(
      and(
        eq(loads.driverUserId, driverUserId),
        eq(loads.status, "APPROVED"),
        eq(loads.isDeleted, false),
        eq(loads.isVoided, false),
        gte(loads.pickupDate, weekStart),
        lte(loads.pickupDate, weekEnd)
      )
    );
  }

  async getApprovedPayItemsForWeek(driverUserId: number, weekStart: string, weekEnd: string): Promise<PayItem[]> {
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);
    weekEndDate.setHours(23, 59, 59, 999);

    const allApproved = await this.db.select().from(payItems).where(
      and(
        eq(payItems.driverUserId, driverUserId),
        eq(payItems.status, "APPROVED")
      )
    );
    return allApproved.filter(pi => {
      if (pi.payrollWeekId) return false;
      if (pi.createdAt) {
        const created = new Date(pi.createdAt);
        return created >= weekStartDate && created <= weekEndDate;
      }
      return false;
    });
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await this.db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await this.db.insert(companies).values(company).returning();
    return created;
  }

  async getAllCompanies(): Promise<Company[]> {
    return this.db.select().from(companies).orderBy(companies.id);
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await this.db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return updated;
  }

  async getCompanyUsers(companyId: number): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.companyId, companyId)).orderBy(users.id);
  }

  async updateLoadOcr(id: number, data: any): Promise<Load | undefined> {
    const [updated] = await this.db.update(loads).set(data).where(eq(loads.id, id)).returning();
    return updated;
  }

  async getSuperAdminStats(): Promise<any> {
    const allCompanies = await this.db.select().from(companies);
    const allUsers = await this.db.select().from(users);
    const allLoads = await this.db.select().from(loads).where(and(eq(loads.isDeleted, false), eq(loads.isVoided, false)));
    const allPayroll = await this.db.select().from(payrollWeeks);
    const totalPayroll = allPayroll.reduce((sum, pw) => sum + Number(pw.netPayTotal || 0), 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentLoads = allLoads.filter(l => l.createdAt && new Date(l.createdAt) >= thirtyDaysAgo);
    const activeCompanies = allCompanies.filter(c => c.isActive);
    const statementsGenerated = allPayroll.filter(pw => pw.statementPdfUrl).length;

    return {
      totalCompanies: allCompanies.length,
      activeCompanies: activeCompanies.length,
      totalUsers: allUsers.length,
      totalLoads: allLoads.length,
      recentLoads: recentLoads.length,
      totalPayroll,
      statementsGenerated,
    };
  }

  async createInvite(invite: InsertInvite): Promise<Invite> {
    const [created] = await this.db.insert(invites).values(invite).returning();
    return created;
  }

  async getInvite(id: number): Promise<Invite | undefined> {
    const [invite] = await this.db.select().from(invites).where(eq(invites.id, id)).limit(1);
    return invite;
  }

  async getInviteByTokenHash(tokenHash: string): Promise<Invite | undefined> {
    const [invite] = await this.db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
    return invite;
  }

  async getInvitesByCompany(companyId: number): Promise<Invite[]> {
    return this.db.select().from(invites).where(eq(invites.companyId, companyId)).orderBy(desc(invites.createdAt));
  }

  async getTeamUsersPaginated(options: { companyId?: number; visibleRoles: string[]; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [sql`${users.deletedAt} IS NULL`];
    if (options.companyId) conditions.push(eq(users.companyId, options.companyId));
    if (options.visibleRoles.length > 0) {
      conditions.push(inArray(users.role, options.visibleRoles as any));
    }
    if (options.search) {
      const p = `%${options.search}%`;
      conditions.push(or(ilike(users.firstName, p), ilike(users.lastName, p), ilike(users.email, p), ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, p)));
    }
    const whereClause = and(...conditions);
    const [{ value: total }] = await this.db.select({ value: drizzleCount() }).from(users).where(whereClause);
    const rows = await this.db.select().from(users).where(whereClause).orderBy(users.id).limit(options.limit).offset(options.offset);
    const items = [];
    for (const u of rows) {
      const profile = u.role === "DRIVER" ? await this.getDriverProfile(u.id) : null;
      items.push({ ...u, passwordHash: undefined, profile });
    }
    return { items, total: Number(total) };
  }

  async getInvitesPaginated(options: { companyId: number; search?: string; limit: number; offset: number }): Promise<{ items: any[]; total: number }> {
    const conditions: any[] = [eq(invites.companyId, options.companyId)];
    if (options.search) {
      const p = `%${options.search}%`;
      conditions.push(or(ilike(invites.email, p), ilike(invites.role, p)));
    }
    const whereClause = and(...conditions);
    const [{ value: total }] = await this.db.select({ value: drizzleCount() }).from(invites).where(whereClause);
    const rows = await this.db.select().from(invites).where(whereClause).orderBy(desc(invites.createdAt)).limit(options.limit).offset(options.offset);
    const now = new Date();
    const items = await Promise.all(rows.map(async (inv) => {
      let status: string;
      if (inv.acceptedAt) status = "accepted";
      else if (inv.revokedAt) status = "revoked";
      else if (new Date(inv.expiresAt) < now) status = "expired";
      else status = "active";
      const createdBy = await this.getUser(inv.createdByUserId);
      return { ...inv, tokenHash: undefined, status, createdByName: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : undefined };
    }));
    return { items, total: Number(total) };
  }

  async updateInvite(id: number, data: Partial<Invite>): Promise<Invite | undefined> {
    const [updated] = await this.db.update(invites).set(data as any).where(eq(invites.id, id)).returning();
    return updated;
  }

  async getCompanySettings(companyId: number): Promise<CompanySettings | undefined> {
    const [settings] = await this.db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    return settings;
  }

  async upsertCompanySettings(companyId: number, data: Partial<InsertCompanySettings>): Promise<CompanySettings> {
    const existing = await this.getCompanySettings(companyId);
    if (existing) {
      const [updated] = await this.db.update(companySettings).set(data).where(eq(companySettings.companyId, companyId)).returning();
      return updated;
    }
    const [created] = await this.db.insert(companySettings).values({ companyId, ...data } as InsertCompanySettings).returning();
    return created;
  }

  async getProfitabilityForWeek(companyId: number, weekStart: string, weekEnd: string): Promise<DriverProfitabilityWeek[]> {
    return this.db.select().from(driverProfitabilityWeeks).where(
      and(
        eq(driverProfitabilityWeeks.companyId, companyId),
        eq(driverProfitabilityWeeks.weekStart, weekStart),
        eq(driverProfitabilityWeeks.weekEnd, weekEnd),
      )
    ).orderBy(desc(driverProfitabilityWeeks.profitTotal));
  }

  async getProfitabilityRow(companyId: number, driverUserId: number, weekStart: string): Promise<DriverProfitabilityWeek | undefined> {
    const [row] = await this.db.select().from(driverProfitabilityWeeks).where(
      and(
        eq(driverProfitabilityWeeks.companyId, companyId),
        eq(driverProfitabilityWeeks.driverUserId, driverUserId),
        eq(driverProfitabilityWeeks.weekStart, weekStart),
      )
    ).limit(1);
    return row;
  }

  async upsertProfitabilityRow(data: InsertDriverProfitabilityWeek): Promise<DriverProfitabilityWeek> {
    const existing = await this.getProfitabilityRow(data.companyId, data.driverUserId, data.weekStart);
    if (existing) {
      const [updated] = await this.db.update(driverProfitabilityWeeks)
        .set({
          ...data,
          overrideScore: existing.overrideScore,
          overrideReason: existing.overrideReason,
          updatedAt: new Date(),
        })
        .where(eq(driverProfitabilityWeeks.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db.insert(driverProfitabilityWeeks).values(data).returning();
    return created;
  }

  async getLoadsForDriverWeek(driverUserId: number, companyId: number, weekStart: string, weekEnd: string): Promise<Load[]> {
    return this.db.select().from(loads).where(
      and(
        eq(loads.driverUserId, driverUserId),
        eq(loads.companyId, companyId),
        gte(loads.pickupDate, weekStart),
        lte(loads.pickupDate, weekEnd),
        sql`${loads.isDeleted} = false`,
        sql`${loads.isVoided} = false`,
      )
    ).orderBy(loads.pickupDate);
  }

  async getPayItemsForDriverWeek(driverUserId: number, companyId: number, weekStart: string, weekEnd: string): Promise<PayItem[]> {
    return this.db.select().from(payItems).where(
      and(
        eq(payItems.driverUserId, driverUserId),
        eq(payItems.companyId, companyId),
        gte(payItems.createdAt, new Date(weekStart)),
        lte(payItems.createdAt, new Date(weekEnd + "T23:59:59.999Z")),
      )
    ).orderBy(payItems.createdAt);
  }

  async getLoadsForCompanyDateRange(companyId: number, startDate: string, endDate: string): Promise<Load[]> {
    return this.db.select().from(loads).where(
      and(
        eq(loads.companyId, companyId),
        gte(loads.pickupDate, startDate),
        lte(loads.pickupDate, endDate),
        sql`${loads.isDeleted} = false`,
        sql`${loads.isVoided} = false`,
      )
    ).orderBy(loads.driverUserId, loads.pickupDate);
  }

  async getPayItemsForCompanyDateRange(companyId: number, startDate: string, endDate: string): Promise<PayItem[]> {
    return this.db.select().from(payItems).where(
      and(
        eq(payItems.companyId, companyId),
        gte(payItems.createdAt, new Date(startDate)),
        lte(payItems.createdAt, new Date(endDate + "T23:59:59.999Z")),
      )
    ).orderBy(payItems.driverUserId, payItems.createdAt);
  }

  async getAggregatedProfitabilityForRange(companyId: number, startDate: string, endDate: string): Promise<any[]> {
    const result = await this.db.execute(sql`
      SELECT
        u.id as driver_user_id,
        u.first_name || ' ' || u.last_name as driver_name,
        dp.assigned_dispatcher_id,
        dp.employment_type as employment_type,
        COALESCE(load_agg.miles_total, 0) as miles_total,
        COALESCE(load_agg.revenue_total, 0) as revenue_total,
        COALESCE(load_agg.loads_count, 0) as loads_count,
        COALESCE(load_agg.missing_revenue_count, 0) as missing_revenue_count,
        COALESCE(pay_agg.earnings, 0) as earnings,
        COALESCE(pay_agg.deductions, 0) as deductions
      FROM ${users} u
      LEFT JOIN ${driverProfiles} dp ON dp.user_id = u.id
      LEFT JOIN (
        SELECT
          l.driver_user_id,
          SUM(COALESCE(l.final_miles, l.adjusted_miles, l.calculated_miles, 0)) as miles_total,
          SUM(COALESCE(l.revenue_amount, 0)) as revenue_total,
          COUNT(*) as loads_count,
          SUM(CASE WHEN l.revenue_amount IS NULL THEN 1 ELSE 0 END) as missing_revenue_count
        FROM ${loads} l
        WHERE l.company_id = ${companyId}
          AND l.pickup_date >= ${startDate}
          AND l.pickup_date <= ${endDate}
          AND l.is_deleted = false
          AND l.is_voided = false
        GROUP BY l.driver_user_id
      ) load_agg ON load_agg.driver_user_id = u.id
      LEFT JOIN (
        SELECT
          pi.driver_user_id,
          SUM(CASE WHEN pi.type IN ('EARNING', 'REIMBURSEMENT') THEN COALESCE(pi.amount, 0) ELSE 0 END) as earnings,
          SUM(CASE WHEN pi.type = 'DEDUCTION' THEN COALESCE(pi.amount, 0) ELSE 0 END) as deductions
        FROM ${payItems} pi
        WHERE pi.company_id = ${companyId}
          AND pi.created_at >= ${startDate}::timestamp
          AND pi.created_at <= (${endDate} || 'T23:59:59.999Z')::timestamp
        GROUP BY pi.driver_user_id
      ) pay_agg ON pay_agg.driver_user_id = u.id
      WHERE u.company_id = ${companyId}
        AND u.is_active = true
        AND u.role = 'DRIVER'
      ORDER BY u.first_name, u.last_name
    `);
    return result.rows;
  }

  async getCompanyCostItems(companyId: number): Promise<CompanyCostItem[]> {
    return this.db.select().from(companyCostItems)
      .where(eq(companyCostItems.companyId, companyId))
      .orderBy(companyCostItems.name);
  }

  async getCompanyCostItemsPaginated(companyId: number, search?: string, limitVal: number = 20, offsetVal: number = 0): Promise<{ items: CompanyCostItem[]; total: number }> {
    const conditions = [eq(companyCostItems.companyId, companyId)];
    if (search && search.trim()) {
      conditions.push(ilike(companyCostItems.name, `%${search.trim()}%`));
    }
    const whereClause = and(...conditions);
    const [countResult] = await this.db.select({ count: sql<number>`count(*)` }).from(companyCostItems).where(whereClause);
    const total = Number(countResult?.count ?? 0);
    const items = await this.db.select().from(companyCostItems)
      .where(whereClause)
      .orderBy(companyCostItems.name)
      .limit(limitVal)
      .offset(offsetVal);
    return { items, total };
  }

  async getCompanyCostItem(id: number, companyId: number): Promise<CompanyCostItem | undefined> {
    const [item] = await this.db.select().from(companyCostItems)
      .where(and(eq(companyCostItems.id, id), eq(companyCostItems.companyId, companyId)))
      .limit(1);
    return item;
  }

  async createCompanyCostItem(data: InsertCompanyCostItem): Promise<CompanyCostItem> {
    const [item] = await this.db.insert(companyCostItems).values(data).returning();
    return item;
  }

  async updateCompanyCostItem(id: number, companyId: number, data: Partial<InsertCompanyCostItem>): Promise<CompanyCostItem | undefined> {
    const [item] = await this.db.update(companyCostItems)
      .set(data)
      .where(and(eq(companyCostItems.id, id), eq(companyCostItems.companyId, companyId)))
      .returning();
    return item;
  }

  async deleteCompanyCostItem(id: number, companyId: number): Promise<boolean> {
    const result = await this.db.delete(companyCostItems)
      .where(and(eq(companyCostItems.id, id), eq(companyCostItems.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getEnabledCompanyCostItems(companyId: number): Promise<CompanyCostItem[]> {
    return this.db.select().from(companyCostItems)
      .where(and(eq(companyCostItems.companyId, companyId), eq(companyCostItems.enabled, true)));
  }

  async getTrucks(companyId: number): Promise<Truck[]> {
    return this.db.select().from(trucks)
      .where(eq(trucks.companyId, companyId))
      .orderBy(trucks.truckNumber);
  }

  async getTruck(id: number, companyId: number): Promise<Truck | undefined> {
    const [truck] = await this.db.select().from(trucks)
      .where(and(eq(trucks.id, id), eq(trucks.companyId, companyId)))
      .limit(1);
    return truck;
  }

  async createTruck(data: InsertTruck): Promise<Truck> {
    const [truck] = await this.db.insert(trucks).values(data).returning();
    return truck;
  }

  async updateTruck(id: number, companyId: number, data: Partial<InsertTruck>): Promise<Truck | undefined> {
    const [truck] = await this.db.update(trucks)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(trucks.id, id), eq(trucks.companyId, companyId)))
      .returning();
    return truck;
  }

  async deleteTruck(id: number, companyId: number): Promise<boolean> {
    const result = await this.db.delete(trucks)
      .where(and(eq(trucks.id, id), eq(trucks.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getDispatcherTrucks(companyId: number, dispatcherUserId?: number): Promise<DispatcherTruck[]> {
    const conditions: any[] = [eq(dispatcherTrucks.companyId, companyId)];
    if (dispatcherUserId) conditions.push(eq(dispatcherTrucks.dispatcherUserId, dispatcherUserId));
    return this.db.select().from(dispatcherTrucks).where(and(...conditions)).orderBy(dispatcherTrucks.dispatcherUserId, dispatcherTrucks.truckId);
  }

  async addDispatcherTruck(data: InsertDispatcherTruck): Promise<DispatcherTruck> {
    const existing = await this.db.select().from(dispatcherTrucks)
      .where(and(eq(dispatcherTrucks.dispatcherUserId, data.dispatcherUserId), eq(dispatcherTrucks.truckId, data.truckId)))
      .limit(1);
    if (existing.length > 0) return existing[0];
    const [row] = await this.db.insert(dispatcherTrucks).values(data).returning();
    return row;
  }

  async removeDispatcherTruck(id: number, companyId: number): Promise<boolean> {
    const result = await this.db.delete(dispatcherTrucks)
      .where(and(eq(dispatcherTrucks.id, id), eq(dispatcherTrucks.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getTrucksForDispatcher(companyId: number, dispatcherUserId: number): Promise<Truck[]> {
    const assignments = await this.db.select({ truckId: dispatcherTrucks.truckId })
      .from(dispatcherTrucks)
      .where(and(eq(dispatcherTrucks.companyId, companyId), eq(dispatcherTrucks.dispatcherUserId, dispatcherUserId)));
    if (assignments.length === 0) {
      return this.db.select().from(trucks).where(eq(trucks.companyId, companyId)).orderBy(trucks.truckNumber);
    }
    const truckIds = assignments.map((a) => a.truckId);
    return this.db.select().from(trucks)
      .where(and(eq(trucks.companyId, companyId), inArray(trucks.id, truckIds)))
      .orderBy(trucks.truckNumber);
  }

  async getDispatcherPerformance(dispatcherId: number, companyId: number, startDate?: string, endDate?: string): Promise<any> {
    const [dispatcher] = await this.db.select().from(users).where(eq(users.id, dispatcherId)).limit(1);
    if (!dispatcher || dispatcher.companyId !== companyId) return null;

    const driverIds = await this.getDriverUserIdsForDispatcher(dispatcherId, companyId);
    const assignedDrivers = driverIds.length;

    let loadsHandled = 0;
    let milesHandled = 0;
    let revenueHandled = 0;

    if (driverIds.length > 0) {
      const loadConditions: any[] = [
        eq(loads.companyId, companyId),
        inArray(loads.driverUserId, driverIds),
        eq(loads.isDeleted, false),
        eq(loads.isVoided, false),
      ];
      if (startDate) loadConditions.push(sql`${loads.pickupDate} >= ${startDate}`);
      if (endDate) loadConditions.push(sql`${loads.pickupDate} <= ${endDate}`);

      const loadRows = await this.db.select({
        id: loads.id,
        finalMiles: loads.finalMiles,
        revenueAmount: loads.revenueAmount,
      }).from(loads).where(and(...loadConditions));

      loadsHandled = loadRows.length;
      milesHandled = loadRows.reduce((s, l) => s + (parseFloat(l.finalMiles ?? "0") || 0), 0);
      revenueHandled = loadRows.reduce((s, l) => s + (parseFloat(l.revenueAmount ?? "0") || 0), 0);
    }

    const truckAssignments = await this.db.select().from(dispatcherTrucks)
      .where(and(eq(dispatcherTrucks.companyId, companyId), eq(dispatcherTrucks.dispatcherUserId, dispatcherId)));
    const assignedTrucks = truckAssignments.length;

    const payModel = (dispatcher as any).dispatcherPayModel ?? null;
    const payRate = parseFloat((dispatcher as any).dispatcherPayRate ?? "0") || 0;

    let earnings = 0;
    if (payModel === "PER_LOAD") {
      earnings = loadsHandled * payRate;
    } else if (payModel === "PERCENT_REVENUE") {
      earnings = revenueHandled * (payRate / 100);
    } else if (payModel === "PER_TRUCK") {
      earnings = assignedTrucks * payRate;
    }

    return {
      summary: {
        earnings: Math.round(earnings * 100) / 100,
        loadsHandled,
        revenueHandled: Math.round(revenueHandled * 100) / 100,
        milesHandled: Math.round(milesHandled * 100) / 100,
        assignedDrivers,
        assignedTrucks,
        payModel,
        payRate,
      },
    };
  }

  async updateDispatcherPay(dispatcherId: number, companyId: number, payModel: string, payRate: number): Promise<any> {
    const existing = await this.db.select().from(users).where(and(eq(users.id, dispatcherId), eq(users.role, "DISPATCHER"))).limit(1);
    if (!existing.length || existing[0].companyId !== companyId) return null;
    const [updated] = await this.db.update(users)
      .set({ dispatcherPayModel: payModel, dispatcherPayRate: String(payRate) } as any)
      .where(eq(users.id, dispatcherId))
      .returning();
    return updated;
  }
}

// No module-level singleton — instantiate per-request in route handlers:
// const db = createDb(env);
// const storage = new DatabaseStorage(db);
