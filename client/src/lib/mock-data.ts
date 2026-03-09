export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
};

// Existing database contacts (to check against)
export const existingContacts: Contact[] = [
  { id: "1", firstName: "Alice", lastName: "Smith", email: "alice@acme.inc", company: "Acme Corp" },
  { id: "2", firstName: "Bob", lastName: "Jones", email: "bob@tech.io", company: "Tech Solutions" },
  { id: "3", firstName: "Charlie", lastName: "Brown", email: "charlie@globex.co", company: "Globex" },
];

// Salesforce report mock data (contains some existing, some new)
export const salesforceReport: Contact[] = [
  { id: "s1", firstName: "Alice", lastName: "Smith", email: "alice@acme.inc", company: "Acme Corp" }, // Existing
  { id: "s2", firstName: "David", lastName: "Miller", email: "david@innovate.co", company: "Innovate Co" }, // New
  { id: "s3", firstName: "Bob", lastName: "Jones", email: "bob@tech.io", company: "Tech Solutions" }, // Existing
  { id: "s4", firstName: "Eva", lastName: "Williams", email: "eva@startup.net", company: "Startup Net" }, // New
  { id: "s5", firstName: "Frank", lastName: "Davis", email: "frank@enterprise.com", company: "Enterprise LLC" }, // New
];
