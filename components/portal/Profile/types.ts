export interface MasterDataView {
  company: string;
  customerNumber: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  ustId: string;
  industry: string;
  customerSince: string;
}

export interface ContactDataView {
  salutation: 'mr' | 'mrs' | 'diverse';
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phone: string;
  mobile: string;
  preferredLocale: 'de' | 'en';
}
