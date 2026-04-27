export interface AddressBookEntry {
  id: string;
  company: string;
  contact: string;
  street: string;
  addressAddition?: string;
  zip: string;
  city: string;
  country: string;
  phone?: string;
  email?: string;
  notes?: string;
}
