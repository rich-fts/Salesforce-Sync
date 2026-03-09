import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchSalesforceReport, isSalesforceConnected } from "./salesforce";
import { addContactsToList, getMarketingLists } from "./sendgrid";
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

  app.post("/api/salesforce/pull", async (_req, res) => {
    try {
      const sfContacts = await fetchSalesforceReport();

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

      const syncLog = await storage.createSyncLog({
        totalPulled: sfContacts.length,
        newContacts: savedNew.length,
        syncedToSendgrid: 0,
        status: "pulled",
      });

      const allContacts = await storage.getAllContacts();

      res.json({
        syncLogId: syncLog.id,
        totalPulled: sfContacts.length,
        newContacts: savedNew.length,
        allContacts,
        pulledContacts: sfContacts,
        newContactDetails: savedNew,
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

  app.post("/api/sendgrid/push", async (req, res) => {
    try {
      const { listId, syncLogId } = req.body;
      if (!listId) {
        return res.status(400).json({ message: "listId is required" });
      }

      const unsyncedContacts = await storage.getUnsyncedContacts();

      if (unsyncedContacts.length === 0) {
        return res.json({ message: "No new contacts to sync", synced: 0 });
      }

      const result = await addContactsToList(listId, unsyncedContacts);

      await storage.markContactsSynced(unsyncedContacts.map((c) => c.email));

      if (syncLogId) {
        await storage.updateSyncLogStatus(syncLogId, "complete", unsyncedContacts.length);
      }

      res.json({
        jobId: result.jobId,
        synced: unsyncedContacts.length,
        contacts: unsyncedContacts,
      });
    } catch (err: any) {
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
