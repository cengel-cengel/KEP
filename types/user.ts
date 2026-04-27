export interface User {
  id: string;
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  phone: string;
  address: {
    street: string;
    zip: string;
    city: string;
    country: string;
  };
}

export interface SessionPayload {
  sub: string;
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  exp?: number;
}
