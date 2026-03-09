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

async function fetchReportById(conn: jsforce.Connection, reportId: string): Promise<SalesforceContact[]> {
  log(`Running Salesforce report ${reportId}...`, "salesforce");

  const { accessToken, instanceUrl } = await getCredentials();

  const response = await fetch(
    `${instanceUrl}/services/data/v59.0/analytics/reports/${reportId}?includeDetails=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reportMetadata: {} }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    log(`Salesforce Report API error: ${response.status} - ${errorBody}`, "salesforce");
    throw new Error(`Failed to run Salesforce report: ${response.status}`);
  }

  const data = await response.json();

  const columns = data.reportMetadata?.detailColumns || [];
  const rows = data.factMap?.["T!T"]?.rows || data.factMap?.["0!T"]?.rows || [];

  if (rows.length === 0) {
    const grandTotal = Object.keys(data.factMap || {});
    for (const key of grandTotal) {
      if (data.factMap[key]?.rows?.length > 0) {
        return parseReportRows(columns, data.factMap[key].rows);
      }
    }
  }

  const contacts = parseReportRows(columns, rows);
  log(`Pulled ${contacts.length} contacts from report ${reportId}`, "salesforce");
  return contacts;
}

function parseReportRows(columns: string[], rows: any[]): SalesforceContact[] {
  const colLower = columns.map((c: string) => c.toLowerCase());

  const emailIdx = colLower.findIndex((c: string) => c.includes("email"));
  const firstIdx = colLower.findIndex((c: string) => c.includes("first_name") || c.includes("firstname") || c === "contact_first_name");
  const lastIdx = colLower.findIndex((c: string) => c.includes("last_name") || c.includes("lastname") || c === "contact_last_name" || c === "name");
  const companyIdx = colLower.findIndex((c: string) => c.includes("account") || c.includes("company") || c.includes("organization"));

  if (emailIdx === -1) {
    throw new Error("Report does not contain an email column. Please ensure your report includes email addresses.");
  }

  const contacts: SalesforceContact[] = [];

  for (const row of rows) {
    const cells = row.dataCells || [];
    const emailVal = cells[emailIdx]?.label || cells[emailIdx]?.value;

    if (!emailVal || typeof emailVal !== "string" || !emailVal.includes("@")) continue;

    contacts.push({
      firstName: firstIdx >= 0 ? (cells[firstIdx]?.label || cells[firstIdx]?.value || "") : "",
      lastName: lastIdx >= 0 ? (cells[lastIdx]?.label || cells[lastIdx]?.value || "") : "",
      email: emailVal.toLowerCase().trim(),
      company: companyIdx >= 0 ? (cells[companyIdx]?.label || cells[companyIdx]?.value || "Unknown") : "Unknown",
    });
  }

  return contacts;
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
