export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  source: string;
  syncedToSendgrid: boolean;
  createdAt: string;
};

export type SyncLog = {
  id: string;
  totalPulled: number;
  newContacts: number;
  syncedToSendgrid: number;
  status: string;
  createdAt: string;
};

export type PullResult = {
  syncLogId: string;
  totalPulled: number;
  newContacts: number;
  alreadyInSendGrid: number;
  contactsToSync: number;
  pulledContacts: { firstName: string; lastName: string; email: string; company: string }[];
  newContactDetails: Contact[];
  contactsToSyncDetails: { firstName: string; lastName: string; email: string; company: string }[];
};

export type SendGridList = {
  id: string;
  name: string;
  contact_count: number;
};

export type ConfigStatus = {
  salesforce: boolean;
  sendgrid: boolean;
  mailchimp: boolean;
};

export type MailchimpAudience = {
  id: string;
  name: string;
  member_count: number;
};

export type SalesforceReport = {
  id: string;
  name: string;
  folderName: string;
};
