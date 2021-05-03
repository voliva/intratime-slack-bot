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

const setupDailyFills = (db) => {
  cron.schedule("0 0 * * *", () => dailyFills(db));
};

module.exports = {
  login,
  setupDailyFills,
  fillAllDay,
  fillHalfDay,
};
