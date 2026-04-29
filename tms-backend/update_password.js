const bcrypt = require('bcrypt');
const { Client } = require('pg');

async function main() {
  const hash = await bcrypt.hash('Admin1234!', 10);
  console.log('Hash:', hash);
  
  const client = new Client({
    connectionString: 'postgresql://tms_user:tms_password@localhost:5432/tms_db'
  });
  
  await client.connect();
  await client.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'admin@tms.local']);
  await client.end();
  console.log('Passwort erfolgreich gesetzt!');
}

main();