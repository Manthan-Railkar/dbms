const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
  const database = process.env.DB_NAME || 'cricket_tracker';

  console.log(`\n🏏 Initializing Live Cricket Score Tracker MySQL Database...`);
  console.log(`Connecting to MySQL at ${host}:${port} as ${user}...`);

  try {
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
    });

    console.log(`✅ Connected to MySQL server successfully!`);

    const sqlPath = path.join(__dirname, '..', 'database', 'schema.mysql.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Applying schema from database/schema.mysql.sql...`);
    await connection.query(sql);

    console.log(`✅ Database "${database}" created and all 11 core tables initialized!`);
    console.log(`\nTables initialized:`);
    console.log(` 1. tournaments`);
    console.log(` 2. venues`);
    console.log(` 3. teams`);
    console.log(` 4. players`);
    console.log(` 5. matches`);
    console.log(` 6. umpires`);
    console.log(` 7. match_umpires`);
    console.log(` 8. innings`);
    console.log(` 9. ball_events`);
    console.log(`10. batting_scorecard`);
    console.log(`11. bowling_scorecard`);
    console.log(`\n🎉 MySQL setup complete! Ready for live scoring.\n`);

    await connection.end();
  } catch (err) {
    console.error(`\n❌ MySQL Setup Error:`, err.message);
    console.error(`\nTip: If MySQL requires a password, edit .env.local with your password:`);
    console.error(`DB_PASSWORD=your_password\n`);
    process.exit(1);
  }
}

main();
