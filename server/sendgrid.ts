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

export async function getListContactEmails(listId: string): Promise<Set<string>> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const emails = new Set<string>();
  const query = `CONTAINS(list_ids, '${listId}')`;
  let page = 1;
  let hasMore = true;

  log(`Fetching existing contacts from SendGrid list ${listId}...`, "sendgrid");

  while (hasMore) {
    const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log(`SendGrid search error: ${response.status} - ${errorBody}`, "sendgrid");
      if (response.status === 404) {
        return emails;
      }
      throw new Error(`SendGrid search API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const results = data.result || [];

    for (const contact of results) {
      if (contact.email) {
        emails.add(contact.email.toLowerCase().trim());
      }
    }

    if (results.length < 50 || !data._metadata?.next) {
      hasMore = false;
    } else {
      page++;
    }
  }

  log(`Found ${emails.size} existing contacts in SendGrid list`, "sendgrid");
  return emails;
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
