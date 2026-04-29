const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://tms_user:tms_password@localhost:5432/tms_db'
  });
  
  await client.connect();
  
  const customerResult = await client.query('SELECT id FROM customers LIMIT 1');
  const customerId = customerResult.rows[0].id;
  console.log('Kunde:', customerId);
  
  await client.query(`
    INSERT INTO addresses (id, customer_id, type, name, street, zip, city, country_code)
    VALUES (gen_random_uuid(), $1, 'loading', 'Müller GmbH Stuttgart', 'Industriestrasse 1', '70565', 'Stuttgart', 'DE')
  `, [customerId]);
  
  await client.query(`
    INSERT INTO addresses (id, customer_id, type, name, street, zip, city, country_code)
    VALUES (gen_random_uuid(), $1, 'delivery', 'Müller GmbH Milano', 'Via Roma 10', '20100', 'Milano', 'IT')
  `, [customerId]);
  
  console.log('Adressen angelegt!');
  await client.end();
}

main();
