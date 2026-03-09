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

export async function addContactsToList(
  listId: string,
  contacts: { email: string; firstName: string; lastName: string; company: string }[]
): Promise<{ jobId: string }> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is not configured.");

  const sgContacts: SendGridContact[] = contacts.map((c) => ({
    email: c.email,
    first_name: c.firstName,
    last_name: c.lastName,
    ...(c.company && c.company !== "Unknown" ? { company: c.company } : {}),
  }));

  const response = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      list_ids: [listId],
      contacts: sgContacts,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log(`SendGrid API error: ${response.status} - ${errorBody}`, "sendgrid");
    throw new Error(`SendGrid API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  log(`SendGrid batch upload started. Job ID: ${data.job_id}`, "sendgrid");
  return { jobId: data.job_id };
}
