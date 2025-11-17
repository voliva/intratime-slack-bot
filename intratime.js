const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const put = util.promisify(request.put);
const { applyTimeString } = require("./features/utils");
const jwt_decode = require("jwt-decode");
const { isToday, isAfter } = require("date-fns");
const cron = require("node-cron");

const generateSign = (UserId, SignIn, date, Time) => ({
  UserId,
  SignIn,
  SignStatus: 1,
  Time,
  ShortTrueTime: Time,
  TrueDate: applyTimeString(date, "09:00:00").toISOString(),
});
const generateAllDay = (UserId, date) => ({
  Comments: "",
  Date: date.toISOString(),
  Signs: [
    generateSign(UserId, true, date, "09:00:00"),
    generateSign(UserId, false, date, "13:00:00"),
    generateSign(UserId, true, date, "14:00:00"),
    generateSign(UserId, false, date, "18:00:00"),
  ],
  UserId,
});
const generateHalfDay = (UserId, date) => ({
  Comments: "",
  Date: date.toISOString(),
  Signs: [
    generateSign(UserId, true, date, "10:00:00"),
    generateSign(UserId, false, date, "14:00:00"),
  ],
  UserId,
});

// New: work-day generator using the SAME structure as generateAllDay / generateHalfDay
// - Mon–Thu: 8h30
//     * startAt8 = false -> 09:00–13:00 / 14:00–18:30
//     * startAt8 = true  -> 08:00–13:00 / 14:00–17:30
// - Friday: 6h -> 09:00–13:00 / 14:00–16:00
const generateWorkDay = (UserId, date, { startAt8 = false } = {}) => {
  // 🔑 KEY FIX: normalize the day to local midnight using applyTimeString,
  // instead of using the raw "date" directly.
  const dayDate = applyTimeString(date, "20:00:00");

  const day = dayDate.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  if (day === 0 || day === 6) {
    // Weekend: no work schedule defined
    throw new Error("No work-day schedule defined for weekends");
  }

  let checkInTime;
  let checkOutTime;

  if (day >= 1 && day <= 4) {
    // Monday–Thursday
    checkInTime = startAt8 ? "08:00:00" : "09:00:00";
    checkOutTime = startAt8 ? "17:30:00" : "18:30:00";
  } else if (day === 5) {
    // Friday
    checkInTime = "09:00:00";
    checkOutTime = "16:00:00";
  }

  return {
    Comments: "",
    // ✅ Use the normalized dayDate here, not the raw `date`
    Date: dayDate.toISOString(),

    // ✅ Also pass dayDate into generateSign, to keep everything aligned
    Signs: [
      generateSign(UserId, true,  dayDate, checkInTime),
      generateSign(UserId, false, dayDate, "13:00:00"),
      generateSign(UserId, true,  dayDate, "14:00:00"),
      generateSign(UserId, false, dayDate, checkOutTime),
    ],

    UserId,
  };
};

const headers = (token) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
});

async function login(username, password) {
  const result = await post(`https://app.woffu.com/token`, {
    form: {
      grant_type: "password",
      username,
      password,
    },
  });
  const { access_token } = JSON.parse(result.body);

  if (!access_token) {
    console.log(result.body);
    throw new Error("permission denied");
  }
  return access_token;
}

async function fillAllDay(db, token, date) {
  if (isToday(date)) {
    enqueueFill(db, token, date, true);
    return "scheduled";
  }

  const { UserId } = jwt_decode(token);
  await put("https://app.woffu.com/api/diaries/selfSigns", {
    headers: headers(token),
    json: generateAllDay(UserId, date),
  });
}

async function fillHalfDay(db, token, date) {
  if (isToday(date)) {
    enqueueFill(db, token, date, false);
    return "scheduled";
  }

  const { UserId } = jwt_decode(token);
  await put("https://app.woffu.com/api/diaries/selfSigns", {
    headers: headers(token),
    json: generateHalfDay(UserId, date),
  });
}

//  New: Fill the working day with new ajustments
// - Uses generateWorkDay (M–T 8h30, F 6h)
// - If it's from today with future times, it is scheduling it on the queue.
async function fillWorkDay(db, token, date, options = {}) {
  if (isToday(date)) {
    enqueueFill(db, token, date, true, {
      workDay: true,
      startAt8: !!options.startAt8,
    });
    return "scheduled";
  }

  const { UserId } = jwt_decode(token);
  const payload = generateWorkDay(UserId, date, options);

  const res = await put("https://app.woffu.com/api/diaries/selfSigns", {
    headers: headers(token),
    json: payload,
  });

  if (res.statusCode >= 400) {
    let msg = `Woffu error ${res.statusCode}`;
    try {
      if (res.body && res.body.Message) {
        msg += `: ${res.body.Message}`;
      }
    } catch (e) {}
    throw new Error(msg);
  }

  return true;
}

// New: time range working days 
// - startDate and endDate
// - For all days:
//     - if Monday to Friday -> calls fillWorkDay with all previous logics defined
//     - if weekend -> it skips it
async function fillWorkRange(db, token, startDate, endDate, options = {}) {
  let current = new Date(startDate);
  const end = new Date(endDate);

  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (current > end) {
    throw new Error("startDate must be before or equal to endDate");
  }

  while (current <= end) {
    const day = current.getDay(); // 1–5 = M-F

    if (day >= 1 && day <= 5) {
      // Cloning date for each day
      const dateForCall = new Date(current);
      await fillWorkDay(db, token, dateForCall, options);
    }

    // Next day, because life is rolling
    current.setDate(current.getDate() + 1);
  }
}


/* old version, to delete if newer is working
 
function enqueueFill(db, token, date, full) {
  const { exp } = jwt_decode(token);
  if (isAfter(Date.now() + 24 * 60 * 60 * 1000, exp * 1000)) {
    throw new Error("token will expire");
  }

  const scheduledFills = db.get("scheduledFills");
  if (scheduledFills.find({ token }).value()) {
    throw new Error("already scheduled");
  }
  scheduledFills.push({ token, date, full }).write();
}
*/

// Magic queue that works for you
// Now it supports:
//   - workDay
//   - startAt8: if we want the schedule 08:00–17:30 from M–T
function enqueueFill(db, token, date, full, options = {}) {
  const { workDay = false, startAt8 = false } = options;

  const { exp } = jwt_decode(token);
  if (isAfter(Date.now() + 24 * 60 * 60 * 1000, exp * 1000)) {
    throw new Error("token will expire");
  }

  const scheduledFills = db.get("scheduledFills");
  if (scheduledFills.find({ token }).value()) {
    throw new Error("already scheduled");
  }

  scheduledFills.push({ token, date, full, workDay, startAt8 }).write();
}

/* old version, remove if new one is working

async function dailyFills(db) {
  const fills = db.get("scheduledFills").value();

  for (let k of fills) {
    try {
      if (k.full) {
        await fillAllDay(db, k.token, new Date(k.date));
      } else {
        await fillHalfDay(db, k.token, new Date(k.date));
      }
    } catch (ex) {
      console.log(ex);
    }
  }

  db.get("scheduledFills")
    .remove(() => true)
    .write();
}
*/

// El CRON nocturno: pasa la escoba y rellena todo lo que haya en la cola
async function dailyFills(db) {
  const fills = db.get("scheduledFills").value();

  for (let k of fills) {
    try {
      if (k.workDay) {
        // Nuevo modo: días con horario L–J/V
        await fillWorkDay(db, k.token, new Date(k.date), {
          startAt8: k.startAt8,
        });
      } else if (k.full) {
        // Modo clásico "full day viejuno"
        await fillAllDay(db, k.token, new Date(k.date));
      } else {
        // Modo "half day" de toda la vida
        await fillHalfDay(db, k.token, new Date(k.date));
      }
    } catch (ex) {
      console.log(ex);
    }
  }

  db.get("scheduledFills")
    .remove(() => true)
    .write();
}

const setupDailyFills = (db) => {
  cron.schedule("0 0 * * *", () => dailyFills(db));
};

module.exports = {
  // Public API used by the bot
  login,
  setupDailyFills,
  fillAllDay,
  fillHalfDay,
  fillWorkDay,
  fillWorkRange,

  // Debug helpers (NOT used by Slack, just for local scripts)
  _debug: {
    generateWorkDay, // the new generator we wrote
    headers,         // your existing headers(token) function
  },
};

