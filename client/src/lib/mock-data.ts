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
  allContacts: Contact[];
  pulledContacts: { firstName: string; lastName: string; email: string; company: string }[];
  newContactDetails: Contact[];
};

export type SendGridList = {
  id: string;
  name: string;
  contact_count: number;
};

export type ConfigStatus = {
  salesforce: boolean;
  sendgrid: boolean;
};

export type SalesforceReport = {
  id: string;
  name: string;
  folderName: string;
};
