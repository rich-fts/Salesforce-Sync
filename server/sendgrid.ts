import { log } from "./index";

type SendGridContact = {
  email: string;
  first_name: string;
  last_name: string;
  company?: string;
  custom_fields?: Record<string, string>;
};

export async function getMarketingLists(): Promise<{ id: string; name: string; contact_count: number }[]> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const response = await fetch("https://api.sendgrid.com/v3/marketing/lists", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return (data.result || []).map((list: any) => ({
    id: list.id,
    name: list.name,
    contact_count: list.contact_count,
  }));
}

export async function createMarketingList(name: string): Promise<{ id: string; name: string; contact_count: number }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const response = await fetch("https://api.sendgrid.com/v3/marketing/lists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  log(`Created SendGrid marketing list: "${name}" (${data.id})`, "sendgrid");
  return { id: data.id, name: data.name, contact_count: 0 };
}

const EMAIL_SEARCH_BATCH_SIZE = 100;

export async function getListContactEmails(listId: string, emailsToCheck?: string[]): Promise<Set<string>> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const foundEmails = new Set<string>();

  if (emailsToCheck && emailsToCheck.length > 0) {
    log(`Checking ${emailsToCheck.length} emails against SendGrid via search/emails endpoint...`, "sendgrid");

    for (let i = 0; i < emailsToCheck.length; i += EMAIL_SEARCH_BATCH_SIZE) {
      const batch = emailsToCheck.slice(i, i + EMAIL_SEARCH_BATCH_SIZE);
      const batchNum = Math.floor(i / EMAIL_SEARCH_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(emailsToCheck.length / EMAIL_SEARCH_BATCH_SIZE);

      const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts/search/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emails: batch }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 404) {
          log(`Batch ${batchNum}/${totalBatches}: none found`, "sendgrid");
          continue;
        }
        log(`SendGrid search/emails error on batch ${batchNum}: ${response.status} - ${errorBody}`, "sendgrid");
        throw new Error(`SendGrid search/emails API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const result = data.result || {};

      for (const [email, contactData] of Object.entries(result as Record<string, any>)) {
        if (contactData.contact) {
          const contactListIds: string[] = contactData.contact.list_ids || [];
          if (contactListIds.includes(listId)) {
            foundEmails.add(email.toLowerCase().trim());
          }
        }
      }

      log(`Batch ${batchNum}/${totalBatches}: found ${foundEmails.size} matches so far`, "sendgrid");
    }
  } else {
    log(`No emails to check, using export to get all contacts from list ${listId}...`, "sendgrid");

    const exportResponse = await fetch("https://api.sendgrid.com/v3/marketing/contacts/exports", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ list_ids: [listId] }),
    });

    if (!exportResponse.ok) {
      const errorBody = await exportResponse.text();
      throw new Error(`SendGrid export API error ${exportResponse.status}: ${errorBody}`);
    }

    const exportData = await exportResponse.json();
    const exportId = exportData.id;
    log(`Export started with ID: ${exportId}, polling for completion...`, "sendgrid");

    let downloadUrls: string[] = [];
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const statusResponse = await fetch(`https://api.sendgrid.com/v3/marketing/contacts/exports/${exportId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json();
      if (statusData.status === "ready") {
        downloadUrls = statusData.urls || [];
        break;
      } else if (statusData.status === "failure") {
        throw new Error("SendGrid export failed");
      }

      log(`Export status: ${statusData.status}, waiting...`, "sendgrid");
    }

    for (const url of downloadUrls) {
      const csvResponse = await fetch(url);
      const csvText = await csvResponse.text();
      const lines = csvText.split("\n");
      const headers = lines[0]?.split(",").map((h) => h.trim().toLowerCase()) || [];
      const emailIdx = headers.indexOf("email");

      if (emailIdx === -1) continue;

      for (let j = 1; j < lines.length; j++) {
        const cols = lines[j].split(",");
        const email = cols[emailIdx]?.trim();
        if (email) foundEmails.add(email.toLowerCase());
      }
    }
  }

  log(`Found ${foundEmails.size} existing contacts in SendGrid list`, "sendgrid");
  return foundEmails;
}

let cachedCompanyFieldId: string | null = null;

async function getCompanyCustomFieldId(): Promise<string | null> {
  if (cachedCompanyFieldId) return cachedCompanyFieldId;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.sendgrid.com/v3/marketing/field_definitions", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      log(`Failed to fetch custom field definitions: ${response.status}`, "sendgrid");
      return null;
    }

    const data = await response.json();
    const customFields = data.custom_fields || [];
    const companyField = customFields.find(
      (f: any) => f.name.toLowerCase() === "company"
    );

    if (companyField) {
      cachedCompanyFieldId = companyField.id;
      log(`Found custom field "Company" with ID: ${companyField.id}`, "sendgrid");
      return companyField.id;
    }

    log(`No custom field named "Company" found. Available: ${customFields.map((f: any) => f.name).join(", ")}`, "sendgrid");
    return null;
  } catch (err: any) {
    log(`Error fetching custom fields: ${err.message}`, "sendgrid");
    return null;
  }
}

const SENDGRID_BATCH_SIZE = 1000;

export async function addContactsToList(
  listId: string,
  contacts: { email: string; firstName: string; lastName: string; company: string }[]
): Promise<{ jobId: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const companyFieldId = await getCompanyCustomFieldId();
  log(`Using ${companyFieldId ? `custom field ${companyFieldId}` : "built-in company field"} for company`, "sendgrid");

  const sgContacts: SendGridContact[] = contacts.map((c) => {
    const contact: SendGridContact = {
      email: c.email,
      first_name: c.firstName,
      last_name: c.lastName,
    };
    if (c.company && c.company !== "Unknown") {
      if (companyFieldId) {
        contact.custom_fields = { [companyFieldId]: c.company };
      } else {
        contact.company = c.company;
      }
    }
    return contact;
  });

  const jobIds: string[] = [];

  for (let i = 0; i < sgContacts.length; i += SENDGRID_BATCH_SIZE) {
    const batch = sgContacts.slice(i, i + SENDGRID_BATCH_SIZE);
    const batchNum = Math.floor(i / SENDGRID_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sgContacts.length / SENDGRID_BATCH_SIZE);

    log(`Uploading batch ${batchNum}/${totalBatches} (${batch.length} contacts)...`, "sendgrid");

    const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        list_ids: [listId],
        contacts: batch,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log(`SendGrid API error on batch ${batchNum}: ${response.status} - ${errorBody}`, "sendgrid");
      throw new Error(`SendGrid API error ${response.status} on batch ${batchNum}: ${errorBody}`);
    }

    const data = await response.json();
    jobIds.push(data.job_id);
    log(`Batch ${batchNum} started. Job ID: ${data.job_id}`, "sendgrid");
  }

  log(`All ${jobIds.length} batches submitted successfully`, "sendgrid");
  return { jobId: jobIds[jobIds.length - 1] };
}
