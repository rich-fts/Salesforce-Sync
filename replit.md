# Contact Sync Dashboard

## Overview
A full-stack application that pulls contacts from a Salesforce report (first name, last name, email, company), deduplicates them against an existing database, and pushes new contacts to a SendGrid marketing campaign list.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL via Drizzle ORM
- **Integrations**: Salesforce API (OAuth via Replit connector), SendGrid Marketing API

## Key Files
- `shared/schema.ts` - Data models (contacts, syncLogs tables)
- `server/routes.ts` - API routes (/api/salesforce/pull, /api/sendgrid/push, etc.)
- `server/storage.ts` - Database CRUD operations via Drizzle
- `server/salesforce.ts` - Salesforce API client for pulling contact reports
- `server/sendgrid.ts` - SendGrid API client for marketing list management
- `server/db.ts` - Database connection setup
- `client/src/pages/Home.tsx` - Main dashboard UI
- `client/src/lib/mock-data.ts` - TypeScript types

## API Routes
- `GET /api/contacts` - List all stored contacts
- `GET /api/contacts/pending` - Check for unsynced contacts (used on startup to restore state)
- `POST /api/contacts/reset-sync` - Reset all sync flags to allow re-pushing
- `POST /api/salesforce/pull` - Pull report from Salesforce, deduplicate, save new contacts
- `GET /api/sendgrid/lists` - Get available SendGrid marketing lists
- `POST /api/sendgrid/push` - Push unsynced contacts to a SendGrid list (fetches from DB, not request body)
- `GET /api/sync-logs` - Get sync history
- `GET /api/config/status` - Check if Salesforce/SendGrid are configured

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-managed by Replit)
- `SALESFORCE_INSTANCE_URL` - Salesforce instance URL (from Replit connector)
- `SALESFORCE_ACCESS_TOKEN` - Salesforce OAuth token (from Replit connector)
- `SENDGRID_API_KEY` - SendGrid API key (user-provided secret)

## Defaults
- Salesforce Report ID: `00OJw00000FMqtlMAD` (pre-selected in the UI dropdown)
- SendGrid List: `Daily Market News` (ID: `115297bb-7915-4671-bdcf-2d4037d6802a`, pre-selected)

## Key Behaviors
- **Startup recovery**: On load, the app checks for unsynced contacts in the DB and restores the "ready to push" state automatically
- **SendGrid custom fields**: Company is mapped via SendGrid's custom field ID (auto-detected from field definitions API)
- **Batching**: SendGrid uploads are batched at 1,000 contacts per API call to avoid payload size limits
- **Express body limit**: Set to 10MB to handle large payloads
- **Re-push**: After a successful push, a "Re-push All" button resets sync flags and allows pushing again (SendGrid deduplicates by email, so no duplicates are created)
- **Deduplication**: Pull route compares against the actual SendGrid list via SGQL search, not just local DB flags

## Workflow
1. User clicks "Fetch Data" to pull contacts from Salesforce
2. System compares against existing database contacts by email and against the SendGrid list
3. New contacts are saved to the database
4. User selects a SendGrid marketing list and clicks "Upload"
5. New contacts are pushed to SendGrid via the Marketing Contacts API (batched at 1,000)
6. After push, "Re-push All" button is available to re-send all contacts if needed
