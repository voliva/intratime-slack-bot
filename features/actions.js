const { applyDateString } = require("./utils");

const dateRegex = /^([0-2][0-9]|3[0-1])-(0[0-9]|1[0-2])-\d{4}$/;

async function fillInDay(text, user, { db, postMessage, intratime }) {
  if (text.startsWith("fill all day")) {
    const params = text.substr("fill all day".length).trim().split(" ");

    let date = new Date();
    if (params.length && params[0]) {
      if (!dateRegex.test(params[0])) {
        return {
          text: `I didn't understand that... if you want to specify a day, you should use the format DD-MM-YYYY`,
        };
      }
      date = applyDateString(date, params[0]);
    }

    await postMessage({
      text: `Sure thing! It will take me a few seconds...`,
    });

    try {
      const result = await intratime.fillAllDay(db, user.token, date);

      if (result === "scheduled") {
        return {
          text: `As I can't fill future hours, I've scheduled to fill the day for you tonight.`,
        };
      }

      return {
        text: `Great! Made all intratimes of the day!`,
      };
    } catch (ex) {
      console.log(ex);
      return {
        text: `Something went wrong :/ - ${ex.message}`,
      };
    }
  }
}

async function fillInHalfDay(text, user, { db, postMessage, intratime }) {
  if (text.startsWith("fill half day")) {
    const params = text.substr("fill half day".length).trim().split(" ");

    let date = new Date();
    if (params.length && params[0]) {
      if (!dateRegex.test(params[0])) {
        return {
          text: `I didn't understand that... if you want to specify a day, you should use the format DD-MM-YYYY`,
        };
      }
      date = applyDateString(date, params[0]);
    }

    await postMessage({
      text: `Sure thing! It will take me a few seconds...`,
    });

    try {
      const result = await intratime.fillHalfDay(db, user.token, date);

      if (result === "scheduled") {
        return {
          text: `As I can't fill future hours, I've scheduled to fill half the day for you tonight.`,
        };
      }

      return {
        text: `Great! Made all intratimes of the half day!`,
      };
    } catch (ex) {
      console.log(ex);
      return {
        text: `Something went wrong :/ - ${ex.message}`,
      };
    }
  }
}

module.exports = {
  commands: [fillInDay, fillInHalfDay],
  help: [
    "`fill all day`: Performs all of the actions of the day with the default time values (check in 09:00, break 13:00, return 14:00 and check out 18:00). You can also set a date",
    "`fill half day`: Performs the actions of half day with the default time values (check in 10:00, check out 14:00). You can also set a date",
  ],
};
