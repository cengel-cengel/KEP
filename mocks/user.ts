import type { User } from '@/types/user';

export const DEMO_USER: User = {
  id: 'demo-user',
  customerId: 'KED-CUST-001',
  email: 'demo@ked.de',
  firstName: 'Max',
  lastName: 'Mustermann',
  company: 'Musterfirma GmbH',
  position: 'Logistikleiter',
  phone: '+49 711 12345',
  address: {
    street: 'Beispielstraße 5',
    zip: '70174',
    city: 'Stuttgart',
    country: 'DE',
  },
};

export const DEMO_CREDENTIALS = {
  email: 'demo@ked.de',
  password: 'demo1234',
};
