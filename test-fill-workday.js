// debug-fill-workday.js
//
// Debug script to inspect what Woffu receives when filling a WorkDay.
// Usage:
//   node debug-fill-workday.js 2025-11-14
//
// The date MUST be in YYYY-MM-DD format.

const readline = require("readline");
const util = require("util");
const request = require("request");
const jwt_decode = require("jwt-decode");

const intratime = require("./intratime");

// Promisify request.put
const put = util.promisify(request.put);

// --- Ask for password interactively ---
function askPassword(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (pw) => {
      rl.close();
      resolve(pw.trim());
    });
  });
}

async function main() {
  console.log("🟦 Woffu Work-Day DEBUG Script (CLI Date)");
  console.log("----------------------------------------");

  // --- 1) Get date from CLI args ---
  const dateArg = process.argv[2];

  if (!dateArg) {
    console.error("❌ Missing date argument.");
    console.error("Usage: node debug-fill-workday.js YYYY-MM-DD");
    process.exit(1);
  }

  // Simple YYYY-MM-DD validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("❌ Date must be in YYYY-MM-DD format.");
    console.error("Example: node debug-fill-workday.js 2025-11-14");
    process.exit(1);
  }

  // Build a Date object at local midnight for the given day
  const FORCED_DATE = new Date(`${dateArg}T00:00:00`);
  if (isNaN(FORCED_DATE.getTime())) {
    console.error("❌ Invalid date provided.");
    process.exit(1);
  }

  // --- 2) Get credentials ---
  const email = process.env.WOFFU_USER;
  if (!email) {
    console.error("❌ Please set WOFFU_USER first.");
    console.error('Example: export WOFFU_USER="your.email@company.com"');
    process.exit(1);
  }

  const password = await askPassword("Woffu password: ");

  // --- 3) Login ---
  console.log("\n🔐 Logging in...");
  const token = await intratime.login(email, password);
  console.log("🔑 Token OK");

  const { UserId } = jwt_decode(token);

  // Log forced date nicely
  const dd = String(FORCED_DATE.getDate()).padStart(2, "0");
  const mm = String(FORCED_DATE.getMonth() + 1).padStart(2, "0");
  const yyyy = FORCED_DATE.getFullYear();
  console.log(`📅 Target date = ${dd}-${mm}-${yyyy} (${dateArg})`);

  // --- 4) Use debug helpers from intratime.js ---
  if (!intratime._debug || !intratime._debug.generateWorkDay || !intratime._debug.headers) {
    console.error("❌ Debug helpers not exported from intratime.js");
    console.error("   Make sure module.exports._debug = { generateWorkDay, headers } exists.");
    process.exit(1);
  }

  const { generateWorkDay, headers } = intratime._debug;

  // Build the payload using your WorkDay generator
  // Note: startAt8 = true → Mon–Thu 08:00–17:30, Fri unaffected (09–16)
  const payload = generateWorkDay(UserId, FORCED_DATE, { startAt8: true });

  console.log("\n--- 📤 PAYLOAD BEING SENT TO WOFFU ---");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n--- 🚀 SENDING REQUEST TO WOFFU ---");

  try {
    const res = await put({
      url: "https://app.woffu.com/api/diaries/selfSigns",
      headers: headers(token),
      json: payload,
    });

    console.log("\n--- 📥 RESPONSE STATUS ---");
    console.log(res.statusCode);

    console.log("\n--- 📥 RESPONSE BODY ---");
    console.log(JSON.stringify(res.body, null, 2));
  } catch (err) {
    console.log("\n❌ ERROR SENDING REQUEST");
    console.log(err.message);
    if (err.statusCode) console.log("Status:", err.statusCode);
    if (err.response?.body) {
      console.log("Response body:", err.response.body);
    }
  }
}

main();

