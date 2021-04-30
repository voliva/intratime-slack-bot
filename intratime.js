const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const get = util.promisify(request.get);
const { applyTimeString } = require("./features/utils");

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
const headers = (apiKey) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Basic ${apiKey}`,
});

async function login(apiKey) {
  // I think I need to know the user id beforehand for every subsequent request. How to do it from API key?
  // Otherwise I'll need the user's.
  // Or maybe I can have only one API key and manage other users with just their ID? O.O
  return btoa(apiKey + ":") + ";" + "TODO user id";
}

async function getStatus(token) {
  const [apiKey, userId] = token.split(";");

  const result = await get(`${baseUrl}/api/v1/users/${userId}/signs`, {
    headers: headers(apiKey),
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
    type: resultObj[0].SignIn ? Action.CheckIn : Action.CheckOut,
    date: resultObj[0].Date,
  };
}

const TIME_RANDOMNESS = 1000 * 60 * 5;
async function submitClocking(token, action, dateTime, random) {
  const [apiKey, userId] = token.split(";");

  if (random) {
    const extraTime = Math.trunc(
      Math.random() * TIME_RANDOMNESS - TIME_RANDOMNESS / 2
    );
    dateTime = new Date(dateTime.getTime() + extraTime);
  }

  const resultObj = await post(`${baseUrl}/api/v1/signs`, {
    json: {
      sign: {
        UserId: userId,
        Date: dateTime.toISOString(),
        SignIn: action === Action.CheckIn || action === Action.Return,
      },
    },
    headers: headers(apiKey),
  });

  if (resultObj.statusCode > 400) {
    let serverMessage = "";
    try {
      serverMessage = JSON.parse(resultObj.body).message;
    } catch (ex) {}

    throw new Error(
      `Service returned error: ${resultObj.statusCode} ${resultObj.statusMessage}. ${serverMessage}`
    );
  }
  if (resultObj.statusCode !== 200) {
    throw new Error(
      `Service returned unexpected status: ${resultObj.statusCode} ${resultObj.body}`
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
