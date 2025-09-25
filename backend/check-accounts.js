const db = require('./database.js');

async function checkAccounts() {
  try {
    const result = await db.query('SELECT id, account_name, email, cookies_json FROM linkedin_accounts WHERE email LIKE "%Test%" OR account_name LIKE "%Test%"');
    
    console.log('Test accounts found:', result.length);
    
    result.forEach(acc => {
      console.log(`\nAccount: ${acc.account_name} (${acc.email})`);
      console.log(`ID: ${acc.id}`);
      console.log(`Cookies JSON: ${acc.cookies_json ? 'Present (' + acc.cookies_json.length + ' chars)' : 'NULL'}`);
      
      if (acc.cookies_json) {
        try {
          const cookies = JSON.parse(acc.cookies_json);
          console.log(`Cookies array length: ${Array.isArray(cookies) ? cookies.length : 'Not an array'}`);
        } catch (e) {
          console.log('Error parsing cookies JSON:', e.message);
        }
      }
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkAccounts();