import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchSalesforceReport, isSalesforceConnected, listSalesforceReports } from "./salesforce";
import { addContactsToList, getMarketingLists, getListContactEmails } from "./sendgrid";
import type { InsertContact } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = await storage.getAllContacts();
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/salesforce/reports", async (_req, res) => {
    try {
      const reports = await listSalesforceReports();
      res.json(reports);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/salesforce/pull", async (req, res) => {
    try {
      const { reportId, listId } = req.body || {};
      const sfContacts = await fetchSalesforceReport(reportId || undefined);

      const existingContacts = await storage.getAllContacts();
      const existingEmails = new Set(existingContacts.map((c) => c.email));

      const newContactsData: InsertContact[] = sfContacts
        .filter((c) => !existingEmails.has(c.email))
        .map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          company: c.company,
          source: "salesforce",
          syncedToSendgrid: false,
        }));

      const savedNew = await storage.createContacts(newContactsData);

      let sendgridEmails = new Set<string>();
      if (listId) {
        sendgridEmails = await getListContactEmails(listId);
      }

      const contactsToSync = sfContacts.filter((c) => !sendgridEmails.has(c.email));

      await storage.syncFlagsFromSendGrid(
        sfContacts.map(c => c.email),
        sendgridEmails
      );

      const syncLog = await storage.createSyncLog({
        totalPulled: sfContacts.length,
        newContacts: savedNew.length,
        syncedToSendgrid: 0,
        status: "pulled",
      });

      res.json({
        syncLogId: syncLog.id,
        totalPulled: sfContacts.length,
        newContacts: savedNew.length,
        alreadyInSendGrid: sendgridEmails.size,
        contactsToSync: contactsToSync.length,
        pulledContacts: sfContacts,
        newContactDetails: savedNew,
        contactsToSyncDetails: contactsToSync,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/contacts/pending", async (_req, res) => {
    try {
      const unsynced = await storage.getUnsyncedContacts();
      const all = await storage.getAllContacts();
      const syncedCount = all.length - unsynced.length;
      res.json({
        total: all.length,
        unsynced: unsynced.length,
        synced: syncedCount,
        contacts: unsynced.map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          company: c.company,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sendgrid/lists", async (_req, res) => {
    try {
      const lists = await getMarketingLists();
      res.json(lists);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/contacts/reset-sync", async (_req, res) => {
    try {
      const count = await storage.resetAllSyncFlags();
      res.json({ reset: count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sendgrid/push", async (req, res) => {
    try {
      const { listId, syncLogId } = req.body;
      if (!listId) {
        return res.status(400).json({ message: "listId is required" });
      }

      const contactsToPush = await storage.getUnsyncedContacts();

      if (contactsToPush.length === 0) {
        return res.json({ message: "No contacts to sync", synced: 0 });
      }

      if (syncLogId) {
        await storage.updateSyncLogStatus(syncLogId, "uploading");
      }

      const result = await addContactsToList(listId, contactsToPush);

      await storage.markContactsSynced(contactsToPush.map((c) => c.email));

      if (syncLogId) {
        await storage.updateSyncLogStatus(syncLogId, "complete", contactsToPush.length);
      }

      res.json({
        jobId: result.jobId,
        synced: contactsToPush.length,
      });
    } catch (err: any) {
      if (req.body?.syncLogId) {
        await storage.updateSyncLogStatus(req.body.syncLogId, "failed").catch(() => {});
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sync-logs", async (_req, res) => {
    try {
      const logs = await storage.getSyncLogs();
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/config/status", async (_req, res) => {
    const sfConnected = await isSalesforceConnected();
    res.json({
      salesforce: sfConnected,
      sendgrid: !!process.env.SENDGRID_API_KEY,
    });
  });

  return httpServer;
}
