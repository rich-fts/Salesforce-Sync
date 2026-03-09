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
- `POST /api/salesforce/pull` - Pull report from Salesforce, deduplicate, save new contacts
- `GET /api/sendgrid/lists` - Get available SendGrid marketing lists
- `POST /api/sendgrid/push` - Push unsynced contacts to a SendGrid list
- `GET /api/sync-logs` - Get sync history
- `GET /api/config/status` - Check if Salesforce/SendGrid are configured

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-managed by Replit)
- `SALESFORCE_INSTANCE_URL` - Salesforce instance URL (from Replit connector)
- `SALESFORCE_ACCESS_TOKEN` - Salesforce OAuth token (from Replit connector)
- `SENDGRID_API_KEY` - SendGrid API key (user-provided secret)

## Workflow
1. User clicks "Fetch Data" to pull contacts from Salesforce
2. System compares against existing database contacts by email
3. New contacts are saved to the database
4. User selects a SendGrid marketing list and clicks "Upload"
5. New contacts are pushed to SendGrid via the Marketing Contacts API
