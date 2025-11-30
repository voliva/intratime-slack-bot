// test-fill-workrange.js
//
// Local test to verify fillWorkRange() over a date interval.
//
// Usage:
//   node test-fill-workrange.js 2025-11-10 2025-11-21
//   node test-fill-workrange.js 2025-11-10 2025-11-21 8
//
// Dates are in YYYY-MM-DD format.
// The optional "8" means: use startAt8 = true (Mon–Thu 08:00–17:30).

const readline = require("readline");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const intratime = require("./intratime");

// Local DB for scheduledFills (same shape as the bot uses)
const adapter = new FileSync("test-workrange-db.json");
const db = low(adapter);
db.defaults({ scheduledFills: [] }).write();

// Simple password prompt
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

function parseDateArg(arg) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    throw new Error(`Invalid date format "${arg}". Use YYYY-MM-DD.`);
  }
  const d = new Date(`${arg}T00:00:00`);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date value "${arg}".`);
  }
  return d;
}

async function main() {
  console.log("🟦 Woffu Work-Range Test Script");
  console.log("--------------------------------");

  // --- 1) Parse CLI arguments ---
  const startArg = process.argv[2];
  const endArg = process.argv[3];
  const startAt8Arg = process.argv[4];

  if (!startArg || !endArg) {
    console.error("❌ Missing arguments.");
    console.error("Usage:");
    console.error("  node test-fill-workrange.js YYYY-MM-DD YYYY-MM-DD [8]");
    process.exit(1);
  }

  let startDate, endDate;
  try {
    startDate = parseDateArg(startArg);
    endDate = parseDateArg(endArg);
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }

  const startAt8 = startAt8Arg === "8";

  // Ensure start <= end
  if (startDate > endDate) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  console.log(
    `📅 Will fill workdays from ${startArg} to ${endArg} (Mon–Fri only) ` +
      (startAt8 ? "with startAt8=true." : "with default start time.")
  );

  // --- 2) Get credentials ---
  const user = process.env.WOFFU_USER;
  if (!user) {
    console.error("❌ Please set WOFFU_USER in your environment.");
    console.error('Example: export WOFFU_USER="your.email@company.com"');
    process.exit(1);
  }

  const pass = await askPassword("Enter Woffu password: ");

  // --- 3) Login ---
  console.log("\n🔐 Logging into Woffu...");
  const token = await intratime.login(user, pass);
  console.log("✅ Login OK");

  // --- 4) Call fillWorkRange ---
  console.log("🚀 Calling intratime.fillWorkRange...");
  try {
    await intratime.fillWorkRange(db, token, startDate, endDate, { startAt8 });
    console.log("🎉 Done! Check Woffu for those dates.");
  } catch (err) {
    console.error("❌ Error from fillWorkRange:", err.message);
  }
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

