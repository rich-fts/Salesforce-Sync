# Contact Sync Dashboard

## Overview
A full-stack application that pulls contacts from Salesforce or Mailchimp (first name, last name, email, company), deduplicates them against an existing database, and pushes new contacts to a SendGrid marketing campaign list.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js with REST API
- **Database**: PostgreSQL via Drizzle ORM
- **Integrations**: Salesforce API (OAuth via Replit connector), Mailchimp API, SendGrid Marketing API

## Key Files
- `shared/schema.ts` - Data models (contacts, syncLogs tables)
- `server/routes.ts` - API routes (/api/salesforce/pull, /api/mailchimp/pull, /api/sendgrid/push, etc.)
- `server/storage.ts` - Database CRUD operations via Drizzle
- `server/salesforce.ts` - Salesforce API client for pulling contact reports
- `server/mailchimp.ts` - Mailchimp API client for pulling audience contacts
- `server/sendgrid.ts` - SendGrid API client for marketing list management
- `server/db.ts` - Database connection setup
- `client/src/pages/Home.tsx` - Main dashboard UI
- `client/src/lib/mock-data.ts` - TypeScript types

## API Routes
- `GET /api/contacts` - List all stored contacts
- `GET /api/contacts/pending` - Check for unsynced contacts (used on startup to restore state)
- `POST /api/contacts/reset-sync` - Reset all sync flags to allow re-pushing
- `POST /api/salesforce/pull` - Pull report from Salesforce, deduplicate, save new contacts
- `GET /api/mailchimp/audiences` - Get available Mailchimp audiences/lists
- `POST /api/mailchimp/pull` - Pull contacts from a Mailchimp audience, deduplicate, save new
- `GET /api/sendgrid/lists` - Get available SendGrid marketing lists
- `POST /api/sendgrid/push` - Push unsynced contacts to a SendGrid list (fetches from DB, not request body)
- `GET /api/sync-logs` - Get sync history
- `GET /api/config/status` - Check if Salesforce/Mailchimp/SendGrid are configured

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-managed by Replit)
- `SALESFORCE_INSTANCE_URL` - Salesforce instance URL (from Replit connector)
- `SALESFORCE_ACCESS_TOKEN` - Salesforce OAuth token (from Replit connector)
- `SENDGRID_API_KEY` - SendGrid API key (user-provided secret)
- `MAILCHIMP_API_KEY` - Mailchimp API key (user-provided secret, format: `key-usX` where X is the data center)

## Defaults
- Salesforce Report ID: `00OJw00000FMqtlMAD` (pre-selected in the UI dropdown)
- SendGrid List: `Daily Market News` (ID: `115297bb-7915-4671-bdcf-2d4037d6802a`, pre-selected)

## Key Behaviors
- **Source-to-destination pairing**: Each pull is paired with a specific SendGrid list in step 1 — source and destination are configured together before fetching
- **Destination persisted**: The `destinationListId` is stored on the sync log in the DB, so pending contacts resume with the correct destination list
- **Data source selector**: UI lets the user switch between Salesforce and Mailchimp as the contact source
- **Searchable audience picker**: Mailchimp audience dropdown includes a search input to filter audiences by name
- **Startup recovery**: On load, the app checks for unsynced contacts in the DB and restores the "ready to push" state with the correct destination list
- **SendGrid custom fields**: Company is mapped via SendGrid's custom field ID (auto-detected from field definitions API)
- **Batching**: SendGrid uploads are batched at 1,000 contacts per API call; Mailchimp contacts fetched with pagination
- **Express body limit**: Set to 10MB to handle large payloads
- **Re-push**: After a successful push, a "Re-push All" button resets sync flags and allows pushing again (SendGrid deduplicates by email, so no duplicates are created)
- **Deduplication**: Pull route compares against the paired SendGrid list via search/emails API (batched at 100), not just local DB flags
- **Mailchimp**: Contacts fetched with `?status=subscribed` filter; company from `COMPANY` or `MMERGE3` merge fields; paginated at 1000 per request

## Workflow
1. User selects data source (Salesforce or Mailchimp), picks a report/audience, and selects the destination SendGrid list
2. User clicks "Fetch Data" to pull contacts from the selected source
3. System compares against the paired SendGrid list by email
4. New contacts are saved to the database
5. User clicks "Upload" to push new contacts to the paired SendGrid list
6. New contacts are pushed to SendGrid via the Marketing Contacts API (batched at 1,000)
7. After push, "Re-push All" button is available to re-send all contacts if needed
