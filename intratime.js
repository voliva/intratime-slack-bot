const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const get = util.promisify(request.get);
const { applyTimeString } = require("./features/utils");
const jwt_decode = require('jwt-decode');

const Action = {
  CheckIn: 0,
  Return: 3, // => Break
  CheckOut: 1, // => Return
  Break: 2, // => CheckOut
};

const defaultTimes = {
  [Action.CheckIn]: "09:00:00",
  [Action.Break]: "13:00:00",
  [Action.Return]: "14:00:00",
  [Action.CheckOut]: "18:00:00",
};
const actionOrder = [
  Action.CheckIn,
  Action.Break,
  Action.Return,
  Action.CheckOut,
];

const baseUrl = "https://weareadaptive.woffu.com";
const headers = (token) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
});

async function login(user, password) {
  return btoa(apiKey + ":") + ";" + "TODO user id";
}

async function getStatus(token) {
  const result = await get(`${baseUrl}/api/signs`, {
    headers: headers(token),
  });

  if (result.statusCode >= 500) {
    console.log(result.body);
    throw new Error(`Internal server error`);
  }
  if (result.statusCode >= 400) {
    console.log(result.body);
    throw new Error(`Invalid credentials`);
  }

  const resultObj = JSON.parse(result.body);
  if (!Array.isArray(resultObj)) {
    throw new Error(`Unknown error when getting status.\n${resultObj}`);
  }

  if (!resultObj.length) {
    return false;
  }

  return {
    type: resultObj[resultObj.length-1].SignIn ? Action.CheckIn : Action.CheckOut,
    date: resultObj[resultObj.length-1].Date + "Z",
  };
}

const TIME_RANDOMNESS = 1000 * 60 * 5;
async function submitClocking(token, action, dateTime, random) {
  if (random) {
    const extraTime = Math.trunc(
      Math.random() * TIME_RANDOMNESS - TIME_RANDOMNESS / 2
    );
    dateTime = new Date(dateTime.getTime() + extraTime);
  }

  const { UserId } = jwt_decode(token)
  const resultObj = await post(`${baseUrl}/api/svc/signs/signs`, {
    json: {
      DeviceId: "SlackBot",
      Date: dateTime.toISOString(),
      UserId,
      SignIn: action === Action.CheckIn || action === Action.Return,
    },
    headers: headers(token),
  });

  if (resultObj.statusCode > 400) {
    throw new Error(
      `Service returned error: ${resultObj.statusCode} ${resultObj.statusMessage}. ${JSON.stringify(resultObj.body)}`
    );
  }
  if (resultObj.statusCode !== 201) {
    throw new Error(
      `Service returned unexpected status: ${resultObj.statusCode} ${JSON.stringify(resultObj.body)}`
    );
  }
  return true;
}

async function fillAllDay(token, date) {
  for (let action of actionOrder) {
    const time = defaultTimes[action];
    const dateTime = applyTimeString(date, time);
    await submitClocking(token, action, dateTime, true);
  }
}

async function fillHalfDay(token, date) {
  await submitClocking(
    token,
    Action.CheckIn,
    applyTimeString(date, "10:00:00"),
    true
  );
  await submitClocking(
    token,
    Action.CheckOut,
    applyTimeString(date, "14:00:00"),
    true
  );
}

module.exports = {
  login,
  getStatus,
  submitClocking,
  fillAllDay,
  fillHalfDay,
  Action,
};
