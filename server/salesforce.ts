import { log } from "./index";

export type SalesforceContact = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
};

export async function fetchSalesforceReport(): Promise<SalesforceContact[]> {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL;
  const accessToken = process.env.SALESFORCE_ACCESS_TOKEN;

  if (!instanceUrl || !accessToken) {
    throw new Error("Salesforce credentials not configured. Please connect your Salesforce account.");
  }

  const query = encodeURIComponent(
    "SELECT FirstName, LastName, Email, Account.Name FROM Contact WHERE Email != null ORDER BY CreatedDate DESC"
  );

  const response = await fetch(`${instanceUrl}/services/data/v59.0/query?q=${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log(`Salesforce API error: ${response.status} - ${errorBody}`, "salesforce");
    throw new Error(`Salesforce API returned ${response.status}: ${errorBody}`);
  }

  const data = await response.json();

  const contacts: SalesforceContact[] = (data.records || [])
    .filter((r: any) => r.Email)
    .map((record: any) => ({
      firstName: record.FirstName || "",
      lastName: record.LastName || "",
      email: record.Email.toLowerCase().trim(),
      company: record.Account?.Name || "Unknown",
    }));

  log(`Pulled ${contacts.length} contacts from Salesforce`, "salesforce");
  return contacts;
}
