const { Action } = require("../intratime");
const { applyTimeString, applyDateString } = require("./utils");

const actionCommands = {
  "check in": Action.CheckIn,
  "check out": Action.CheckOut,
  break: Action.Break,
  return: Action.Return,
};

// Accepts HH:MM:SS or HH:MM
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const dateRegex = /^([0-2][0-9]|3[0-1])-(0[0-9]|1[0-2])-\d{4}$/;

async function actionsCommand(text, user, { postMessage, intratime }) {
  const checkCommand = Object.keys(actionCommands).find((key) =>
    text.startsWith(key)
  );
  if (checkCommand) {
    const action = actionCommands[checkCommand];
    const params = text.substr(checkCommand.length).trim().split(" ");

    let date = new Date();
    if (params.length === 1 && params[0]) {
      // It must be a time string
      if (!timeRegex.test(params[0])) {
        return {
          text: `I didn't understand that... if you want to specify a time, you should use the format HH:MM or HH:MM:SS`,
        };
      }
      date = applyTimeString(date, params[0]);
    } else if (params.length >= 2) {
      // It must be "date time" string
      if (!dateRegex.test(params[0])) {
        return {
          text: `I didn't understand the date... make sure the first parameter is a date (DD-MM-YYYY)`,
        };
      }
      if (!timeRegex.test(params[1])) {
        return {
          text: `I didn't understand the time... make sure the second parameter is a time (HH:MM or HH:MM:SS)`,
        };
      }
      date = applyDateString(date, params[0]);
      date = applyTimeString(date, params[1]);
    }

    await postMessage({
      text: `Sure thing! It will take just a second...`,
    });

    try {
      await intratime.submitClocking(user.token, action, date);

      return {
        text: `Done! :)`,
      };
    } catch (ex) {
      return {
        text: `Something went wrong :/\n(Error: ${ex.message})`,
      };
    }
  }
}

async function fillInDay(text, user, { postMessage, intratime }) {
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
      await intratime.fillAllDay(user.token, date);

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

async function fillInHalfDay(text, user, { postMessage, intratime }) {
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
      await intratime.fillHalfDay(user.token, date);

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
  commands: [actionsCommand, fillInDay, fillInHalfDay],
  help: [
    ...Object.keys(actionCommands).map(
      (command) =>
        `\`${command}\`, \`${command} HH:MM:SS\` or \`${command} DD-MM-YYYY HH:MM:SS\`: Performs intratime action ${command}`
    ),
    "`fill all day`: Performs all of the actions of the day with the default time values (check in 09:00, break 13:00, return 14:00 and check out 18:00). You can also set a date",
    "`fill half day`: Performs the actions of half day with the default time values (check in 10:00, check out 14:00). You can also set a date",
  ],
};
