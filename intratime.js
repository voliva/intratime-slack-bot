const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const get = util.promisify(request.get);
const {
  format
} = require("date-fns");

const Action = {
  CheckIn: 0,
  Return: 3, // => Break
  CheckOut: 1, // => Return
  Break: 2 // => CheckOut
};

async function login(user, pin) {
  const result = await post("https://newapi.intratime.es/api/user/login", {
    form: {
      user,
      pin
    }
  });

  const resultObj = JSON.parse(result.body);

  if (resultObj.status_code === 401) {
    throw new Error(`Invalid credentials`);
  }
  if (!resultObj.USER_TOKEN) {
    throw new Error(`Unknown error when logging in.\n${resultObj}`);
  }

  return resultObj.USER_TOKEN;
}

async function getStatus(token) {
  const result = await get(
    "https://newapi.intratime.es/api/user/clockings?last=true&type=0,1,2,3",
    {
      headers: {
        token
      }
    }
  );
  const resultObj = JSON.parse(result.body);

  if (resultObj.status_code === 401) {
    throw new Error(`Invalid credentials`);
  }
  if (!Array.isArray(resultObj)) {
    throw new Error(`Unknown error when getting status.\n${resultObj}`);
  }

  if (!resultObj.length) {
    return false;
  }

  return {
    type: resultObj[0].INOUT_TYPE,
    date: resultObj[0].INOUT_DATE
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

  const resultObj = await post(
    "https://newapi.intratime.es/api/user/clocking",
    {
      form: {
        user_action: `${action}`,
        user_timestamp: format(dateTime, "yyyy-MM-dd HH:mm:ss"),
        user_gps_coordinates: "41.4050371,2.1926044",
        user_use_server_time: "false"
      },
      headers: {
        token
      }
    }
  );

  if (resultObj.statusCode === 429) {
    throw new Error('Rate limit exceeded');
  }
  if (resultObj.statusCode > 400) {
    let serverMessage = "";
    try {
      serverMessage = JSON.parse(resultObj.body).message;
    } catch (ex) {}

    throw new Error(
      `Service returned error: ${resultObj.statusCode} ${resultObj.statusMessage}. ${serverMessage}`
    );
  }
  if (resultObj.statusCode !== 201) {
    throw new Error(
      `Service returned unexpected status: ${resultObj.statusCode} ${resultObj.body}`
    );
  }
  return true;
}

module.exports = {
  login,
  getStatus,
  submitClocking,
  fillAllDay,
  Action
};
