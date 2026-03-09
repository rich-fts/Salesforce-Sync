import { log } from "./index";

type MailchimpContact = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
};

type MailchimpAudience = {
  id: string;
  name: string;
  member_count: number;
};

function getMailchimpConfig(): { apiKey: string; server: string } {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  if (!apiKey) throw new Error("MAILCHIMP_API_KEY is not configured.");
  const server = apiKey.split("-").pop();
  if (!server) throw new Error("Invalid Mailchimp API key format. Expected key to end with -usX.");
  return { apiKey, server };
}

export function isMailchimpConnected(): boolean {
  return !!process.env.MAILCHIMP_API_KEY;
}

export async function listMailchimpAudiences(): Promise<MailchimpAudience[]> {
  const { apiKey, server } = getMailchimpConfig();

  const response = await fetch(`https://${server}.api.mailchimp.com/3.0/lists?count=100`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Mailchimp API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return (data.lists || []).map((list: any) => ({
    id: list.id,
    name: list.name,
    member_count: list.stats?.member_count || 0,
  }));
}

export async function fetchMailchimpAudienceContacts(audienceId: string): Promise<MailchimpContact[]> {
  const { apiKey, server } = getMailchimpConfig();
  const contacts: MailchimpContact[] = [];
  const pageSize = 1000;
  let offset = 0;
  let totalItems = 0;

  log(`Fetching contacts from Mailchimp audience ${audienceId}...`, "mailchimp");

  do {
    const url = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members?count=${pageSize}&offset=${offset}&status=subscribed`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log(`Mailchimp API error: ${response.status} - ${errorBody}`, "mailchimp");
      throw new Error(`Mailchimp API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    totalItems = data.total_items || 0;
    const members = data.members || [];

    for (const member of members) {
      contacts.push({
        firstName: member.merge_fields?.FNAME || "",
        lastName: member.merge_fields?.LNAME || "",
        email: member.email_address,
        company: member.merge_fields?.COMPANY || member.merge_fields?.MMERGE3 || "",
      });
    }

    if (members.length === 0) {
      log(`Mailchimp returned 0 members at offset ${offset} with ${totalItems} total — stopping pagination.`, "mailchimp");
      break;
    }
    offset += members.length;
    log(`Fetched ${offset}/${totalItems} contacts from Mailchimp...`, "mailchimp");
  } while (offset < totalItems);

  log(`Total contacts fetched from Mailchimp: ${contacts.length}`, "mailchimp");
  return contacts;
}
