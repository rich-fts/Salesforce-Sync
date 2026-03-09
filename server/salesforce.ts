// Salesforce integration via Replit connector (jsforce)
import jsforce from 'jsforce';
import { log } from "./index";

let connectionSettings: any;

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

export async function fetchSalesforceReport(): Promise<SalesforceContact[]> {
  const conn = await getUncachableSalesforceClient();

  log("Querying Salesforce contacts...", "salesforce");

  const result = await conn.query(
    "SELECT FirstName, LastName, Email, Account.Name FROM Contact WHERE Email != null ORDER BY CreatedDate DESC"
  );

  const contacts: SalesforceContact[] = (result.records || [])
    .filter((r: any) => r.Email)
    .map((record: any) => ({
      firstName: record.FirstName || "",
      lastName: record.LastName || "",
      email: (record.Email as string).toLowerCase().trim(),
      company: record.Account?.Name || "Unknown",
    }));

  log(`Pulled ${contacts.length} contacts from Salesforce`, "salesforce");
  return contacts;
}

export async function isSalesforceConnected(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}
