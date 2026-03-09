// Salesforce integration via Replit connector (jsforce)
import jsforce from 'jsforce';
import { log } from "./index";

let connectionSettings: any;

const SF_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;

async function getCredentials() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return {
      accessToken: connectionSettings.settings.access_token,
      instanceUrl: connectionSettings.settings.instance_url
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=salesforce',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  const instanceUrl = connectionSettings?.settings?.instance_url;

  if (!connectionSettings || !accessToken || !instanceUrl) {
    throw new Error('Salesforce not connected');
  }

  return {
    accessToken,
    instanceUrl
  };
}

async function getUncachableSalesforceClient() {
  const { accessToken, instanceUrl } = await getCredentials();

  const conn = new jsforce.Connection({
    instanceUrl: instanceUrl,
    accessToken: accessToken
  });

  return conn;
}

export type SalesforceContact = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
};

export type SalesforceReport = {
  id: string;
  name: string;
  folderName: string;
};

export async function listSalesforceReports(): Promise<SalesforceReport[]> {
  const conn = await getUncachableSalesforceClient();

  log("Listing Salesforce reports...", "salesforce");

  const result = await conn.query(
    "SELECT Id, Name, FolderName FROM Report WHERE Format = 'Tabular' OR Format = 'Summary' ORDER BY Name ASC"
  );

  const reports: SalesforceReport[] = (result.records || []).map((r: any) => ({
    id: r.Id,
    name: r.Name,
    folderName: r.FolderName || "Unfiled",
  }));

  log(`Found ${reports.length} reports in Salesforce`, "salesforce");
  return reports;
}

export async function fetchSalesforceReport(reportId?: string): Promise<SalesforceContact[]> {
  const conn = await getUncachableSalesforceClient();

  if (reportId) {
    if (!SF_ID_REGEX.test(reportId)) {
      throw new Error("Invalid Salesforce report ID format.");
    }
    return fetchReportById(conn, reportId);
  }

  return fetchAllContacts(conn);
}

async function fetchAllContacts(conn: jsforce.Connection): Promise<SalesforceContact[]> {
  log("Querying all Salesforce contacts (with pagination)...", "salesforce");

  const allRecords: any[] = [];

  const result = await conn.query(
    "SELECT FirstName, LastName, Email, Account.Name FROM Contact WHERE Email != null ORDER BY CreatedDate DESC"
  );

  allRecords.push(...(result.records || []));

  let queryResult = result;
  while (!queryResult.done && queryResult.nextRecordsUrl) {
    log(`Fetching next batch (${allRecords.length} so far)...`, "salesforce");
    queryResult = await conn.queryMore(queryResult.nextRecordsUrl);
    allRecords.push(...(queryResult.records || []));
  }

  log(`Total records fetched: ${allRecords.length}`, "salesforce");
  return parseContactRecords(allRecords);
}

const COLUMN_TO_SOQL: Record<string, string> = {
  "contact.first_name": "FirstName",
  "contact.last_name": "LastName",
  "contact.email": "Email",
  "contact.name": "Name",
  "contact.title": "Title",
  "contact.phone": "Phone",
  "contact.mobilephone": "MobilePhone",
  "contact.mailingcity": "MailingCity",
  "contact.mailingstate": "MailingState",
  "contact.mailingcountry": "MailingCountry",
  "contact.department": "Department",
  "contact.created_date": "CreatedDate",
  "contact.lastmodifieddate": "LastModifiedDate",
  "contact.owner": "Owner.Name",
  "account.name": "Account.Name",
  "account_name": "Account.Name",
  "first_name": "FirstName",
  "last_name": "LastName",
  "email": "Email",
  "name": "Name",
  "title": "Title",
  "phone": "Phone",
  "FK_ACC_NAME": "Account.Name",
  "fk_acc_name": "Account.Name",
};

function reportFilterToSOQL(filter: any): string | null {
  const col = filter.column;
  const op = filter.operator;
  const val = filter.value;

  const soqlField = COLUMN_TO_SOQL[col?.toLowerCase()] || col;
  if (!soqlField) return null;

  switch (op) {
    case "equals": return `${soqlField} = '${escapeSOQL(val)}'`;
    case "notEqual": return `${soqlField} != '${escapeSOQL(val)}'`;
    case "contains": return `${soqlField} LIKE '%${escapeSOQL(val)}%'`;
    case "notContain": return `(NOT ${soqlField} LIKE '%${escapeSOQL(val)}%')`;
    case "startsWith": return `${soqlField} LIKE '${escapeSOQL(val)}%'`;
    case "greaterThan": return `${soqlField} > '${escapeSOQL(val)}'`;
    case "lessThan": return `${soqlField} < '${escapeSOQL(val)}'`;
    case "greaterOrEqual": return `${soqlField} >= '${escapeSOQL(val)}'`;
    case "lessOrEqual": return `${soqlField} <= '${escapeSOQL(val)}'`;
    default: return null;
  }
}

function escapeSOQL(val: string): string {
  return val.replace(/'/g, "\\'");
}

async function fetchReportById(conn: jsforce.Connection, reportId: string): Promise<SalesforceContact[]> {
  log(`Fetching report metadata for ${reportId} to build paginated query...`, "salesforce");

  const { accessToken, instanceUrl } = await getCredentials();

  const descResponse = await fetch(
    `${instanceUrl}/services/data/v59.0/analytics/reports/${reportId}/describe`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!descResponse.ok) {
    const errorBody = await descResponse.text();
    log(`Report describe error: ${descResponse.status} - ${errorBody}`, "salesforce");
    throw new Error(`Failed to describe Salesforce report: ${descResponse.status}`);
  }

  const metadata = await descResponse.json();
  const reportMetadata = metadata.reportMetadata || metadata;
  const reportType = reportMetadata.reportType?.type || "";
  const detailColumns: string[] = reportMetadata.detailColumns || [];
  const reportFilters: any[] = reportMetadata.reportFilters || [];
  const reportBooleanFilter: string | null = reportMetadata.reportBooleanFilter || null;

  log(`Report type: ${reportType}, columns: ${detailColumns.join(", ")}`, "salesforce");
  log(`Filters: ${JSON.stringify(reportFilters)}`, "salesforce");

  const selectFields = new Set<string>();
  selectFields.add("FirstName");
  selectFields.add("LastName");
  selectFields.add("Email");
  selectFields.add("Account.Name");

  for (const col of detailColumns) {
    const mapped = COLUMN_TO_SOQL[col.toLowerCase()] || COLUMN_TO_SOQL[col];
    if (mapped) selectFields.add(mapped);
  }

  const whereClauses: string[] = ["Email != null"];

  const filterClauses: (string | null)[] = reportFilters.map((f: any) => reportFilterToSOQL(f));
  const validFilterClauses = filterClauses.filter((c): c is string => c !== null);

  if (validFilterClauses.length > 0) {
    if (reportBooleanFilter) {
      let combinedFilter = reportBooleanFilter;
      validFilterClauses.forEach((clause, idx) => {
        combinedFilter = combinedFilter.replace(new RegExp(`\\b${idx + 1}\\b`, "g"), `(${clause})`);
      });
      whereClauses.push(`(${combinedFilter})`);
    } else {
      whereClauses.push(...validFilterClauses);
    }
  }

  const soql = `SELECT ${Array.from(selectFields).join(", ")} FROM Contact WHERE ${whereClauses.join(" AND ")} ORDER BY CreatedDate DESC`;
  log(`Generated SOQL: ${soql}`, "salesforce");

  const allRecords: any[] = [];
  let queryResult = await conn.query(soql);
  allRecords.push(...(queryResult.records || []));

  while (!queryResult.done && queryResult.nextRecordsUrl) {
    log(`Paginating report query (${allRecords.length} records so far)...`, "salesforce");
    queryResult = await conn.queryMore(queryResult.nextRecordsUrl);
    allRecords.push(...(queryResult.records || []));
  }

  log(`Total records from report query: ${allRecords.length}`, "salesforce");
  return parseContactRecords(allRecords);
}

function parseContactRecords(records: any[]): SalesforceContact[] {
  return records
    .filter((r: any) => r.Email)
    .map((record: any) => ({
      firstName: record.FirstName || "",
      lastName: record.LastName || "",
      email: (record.Email as string).toLowerCase().trim(),
      company: record.Account?.Name || "Unknown",
    }));
}

export async function isSalesforceConnected(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}
