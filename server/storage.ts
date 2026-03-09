import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { contacts, syncLogs, type Contact, type InsertContact, type SyncLog, type InsertSyncLog } from "@shared/schema";

export interface IStorage {
  getAllContacts(): Promise<Contact[]>;
  getContactByEmail(email: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  createContacts(contactList: InsertContact[]): Promise<Contact[]>;
  deleteAllContacts(): Promise<number>;
  markContactsSynced(emails: string[]): Promise<void>;
  resetAllSyncFlags(): Promise<number>;
  getUnsyncedContacts(): Promise<Contact[]>;
  syncFlagsFromSendGrid(allEmails: string[], sendgridEmails: Set<string>): Promise<void>;
  createSyncLog(log: InsertSyncLog): Promise<SyncLog>;
  updateSyncLogStatus(id: string, status: string, syncedCount?: number): Promise<SyncLog | undefined>;
  getSyncLogs(): Promise<SyncLog[]>;
}

export class DatabaseStorage implements IStorage {
  async getAllContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async getContactByEmail(email: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.email, email));
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async createContacts(contactList: InsertContact[]): Promise<Contact[]> {
    if (contactList.length === 0) return [];
    const created = await db.insert(contacts).values(contactList).onConflictDoNothing({ target: contacts.email }).returning();
    return created;
  }

  async deleteAllContacts(): Promise<number> {
    const result = await db.delete(contacts).returning();
    return result.length;
  }

  async markContactsSynced(emails: string[]): Promise<void> {
    for (const email of emails) {
      await db.update(contacts).set({ syncedToSendgrid: true }).where(eq(contacts.email, email));
    }
  }

  async resetAllSyncFlags(): Promise<number> {
    const result = await db.update(contacts).set({ syncedToSendgrid: false }).returning();
    return result.length;
  }

  async getUnsyncedContacts(): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.syncedToSendgrid, false));
  }

  async syncFlagsFromSendGrid(allEmails: string[], sendgridEmails: Set<string>): Promise<void> {
    for (const email of allEmails) {
      const inSendGrid = sendgridEmails.has(email);
      await db.update(contacts).set({ syncedToSendgrid: inSendGrid }).where(eq(contacts.email, email));
    }
  }

  async createSyncLog(log: InsertSyncLog): Promise<SyncLog> {
    const [created] = await db.insert(syncLogs).values(log).returning();
    return created;
  }

  async updateSyncLogStatus(id: string, status: string, syncedCount?: number): Promise<SyncLog | undefined> {
    const updates: Partial<SyncLog> = { status };
    if (syncedCount !== undefined) {
      updates.syncedToSendgrid = syncedCount;
    }
    const [updated] = await db.update(syncLogs).set(updates).where(eq(syncLogs.id, id)).returning();
    return updated;
  }

  async getSyncLogs(): Promise<SyncLog[]> {
    return db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt));
  }
}

export const storage = new DatabaseStorage();
