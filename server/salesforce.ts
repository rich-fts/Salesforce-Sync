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

type ReportTypeConfig = {
  soqlObject: string;
  contactPrefix: string;
  columnMap: Record<string, string>;
  filterMap: Record<string, string>;
};

const CAMPAIGN_CONTACT_CONFIG: ReportTypeConfig = {
  soqlObject: "CampaignMember",
  contactPrefix: "Contact.",
  columnMap: {
    "first_name": "Contact.FirstName",
    "last_name": "Contact.LastName",
    "email": "Contact.Email",
    "account.name": "Contact.Account.Name",
    "name": "Contact.Name",
    "title": "Contact.Title",
    "phone": "Contact.Phone",
    "fk_acc_name": "Contact.Account.Name",
  },
  filterMap: {
    "campaign_name": "Campaign.Name",
    "campaign.name": "Campaign.Name",
    "email_opt_out": "Contact.HasOptedOutOfEmail",
    "hasoptedoutofemail": "Contact.HasOptedOutOfEmail",
    "email": "Contact.Email",
    "first_name": "Contact.FirstName",
    "last_name": "Contact.LastName",
    "account.name": "Contact.Account.Name",
    "fk_acc_name": "Contact.Account.Name",
  },
};

const CONTACT_CONFIG: ReportTypeConfig = {
  soqlObject: "Contact",
  contactPrefix: "",
  columnMap: {
    "first_name": "FirstName",
    "last_name": "LastName",
    "email": "Email",
    "account.name": "Account.Name",
    "name": "Name",
    "title": "Title",
    "phone": "Phone",
    "mobilephone": "MobilePhone",
    "mailingcity": "MailingCity",
    "mailingstate": "MailingState",
    "mailingcountry": "MailingCountry",
    "department": "Department",
    "fk_acc_name": "Account.Name",
    "contact.first_name": "FirstName",
    "contact.last_name": "LastName",
    "contact.email": "Email",
    "contact.name": "Name",
    "contact.title": "Title",
    "contact.phone": "Phone",
  },
  filterMap: {
    "first_name": "FirstName",
    "last_name": "LastName",
    "email": "Email",
    "email_opt_out": "HasOptedOutOfEmail",
    "hasoptedoutofemail": "HasOptedOutOfEmail",
    "account.name": "Account.Name",
    "fk_acc_name": "Account.Name",
    "contact.first_name": "FirstName",
    "contact.last_name": "LastName",
    "contact.email": "Email",
  },
};

function getReportTypeConfig(reportType: string): ReportTypeConfig {
  const rt = reportType.toLowerCase();
  if (rt.includes("campaigncontact") || rt.includes("campaignmember") || rt.includes("campaign")) {
    return CAMPAIGN_CONTACT_CONFIG;
  }
  return CONTACT_CONFIG;
}

function resolveFilterField(filter: any, config: ReportTypeConfig): string | null {
  const col = filter.column;
  if (!col) return null;

  const colLower = col.toLowerCase();
  if (config.filterMap[colLower]) return config.filterMap[colLower];

  if (col.includes(".") || col.includes("__c")) {
    if (config.soqlObject === "CampaignMember" && !col.startsWith("Contact.") && !col.startsWith("Campaign.")) {
      return `Contact.${col}`;
    }
    return col;
  }

  return null;
}

const BOOLEAN_FIELDS = new Set([
  "hasoptedoutofemail",
  "contact.hasoptedoutofemail",
  "donotcall",
  "contact.donotcall",
  "hasoptedoutoffax",
  "contact.hasoptedoutoffax",
  "isdeleted",
  "contact.isdeleted",
]);

function isBooleanValue(val: string): boolean {
  const v = val.toLowerCase().trim();
  return v === "true" || v === "false" || v === "1" || v === "0";
}

function toBooleanLiteral(val: string): string {
  const v = val.toLowerCase().trim();
  return (v === "true" || v === "1") ? "true" : "false";
}

function formatSOQLValue(field: string, val: string): string {
  if (BOOLEAN_FIELDS.has(field.toLowerCase()) || isBooleanValue(val)) {
    return toBooleanLiteral(val);
  }
  return `'${escapeSOQL(val)}'`;
}

function buildFilterClause(field: string, op: string, val: string): string | null {
  const formatted = formatSOQLValue(field, val);
  switch (op) {
    case "equals": return `${field} = ${formatted}`;
    case "notEqual": return `${field} != ${formatted}`;
    case "contains": return `${field} LIKE '%${escapeSOQL(val)}%'`;
    case "notContain": return `(NOT ${field} LIKE '%${escapeSOQL(val)}%')`;
    case "startsWith": return `${field} LIKE '${escapeSOQL(val)}%'`;
    case "greaterThan": return `${field} > ${formatted}`;
    case "lessThan": return `${field} < ${formatted}`;
    case "greaterOrEqual": return `${field} >= ${formatted}`;
    case "lessOrEqual": return `${field} <= ${formatted}`;
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

  const config = getReportTypeConfig(reportType);
  log(`Using config for object: ${config.soqlObject}`, "salesforce");

  const emailField = config.contactPrefix + "Email";
  const firstNameField = config.contactPrefix + "FirstName";
  const lastNameField = config.contactPrefix + "LastName";
  const accountField = config.contactPrefix + "Account.Name";

  const selectFields = new Set<string>();
  selectFields.add(firstNameField);
  selectFields.add(lastNameField);
  selectFields.add(emailField);
  selectFields.add(accountField);

  for (const col of detailColumns) {
    const mapped = config.columnMap[col.toLowerCase()];
    if (mapped) selectFields.add(mapped);
  }

  const whereClauses: string[] = [`${emailField} != null`];

  const filterClauses: (string | null)[] = reportFilters.map((f: any) => {
    const field = resolveFilterField(f, config);
    if (!field) {
      log(`Skipping unmapped filter column: ${f.column}`, "salesforce");
      return null;
    }
    return buildFilterClause(field, f.operator, f.value);
  });
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

  const soql = `SELECT ${Array.from(selectFields).join(", ")} FROM ${config.soqlObject} WHERE ${whereClauses.join(" AND ")} ORDER BY CreatedDate DESC`;
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

  if (config.soqlObject === "CampaignMember") {
    return parseCampaignMemberRecords(allRecords);
  }
  return parseContactRecords(allRecords);
}

function parseCampaignMemberRecords(records: any[]): SalesforceContact[] {
  return records
    .filter((r: any) => r.Contact?.Email)
    .map((record: any) => ({
      firstName: record.Contact?.FirstName || "",
      lastName: record.Contact?.LastName || "",
      email: (record.Contact.Email as string).toLowerCase().trim(),
      company: record.Contact?.Account?.Name || "Unknown",
    }));
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
