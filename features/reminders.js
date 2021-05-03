const {
  set,
  isToday,
  isWeekend,
  format,
  getMonth,
  getDay,
} = require("date-fns");
const { zonedTimeToUtc } = require("date-fns-tz");
const cron = require("node-cron");
const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const { fillAllDay, fillHalfDay } = require("../intratime");

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

async function setupReminderCommand(text, user, { db }) {
  const query = text.split(" ");
  if (query[0] === "remind" && timeRegex.test(query[1])) {
    const time = query[1].split(":");
    const timeString = time.slice(0, 2).join(":");

    db.get("users")
      .find(user)
      .assign({
        reminder: timeString,
      })
      .write();

    return {
      text: `Sure! I'll remind you about woffu every day at ${timeString}`,
    };
  }
}

async function stopReminderCommand(text, user, { db }) {
  if (text.startsWith("remind stop")) {
    db.get("users")
      .find(user)
      .assign({
        reminder: undefined,
      })
      .write();

    return {
      text: `Alright, I won't remind you about woffu anymore`,
    };
  }
}

async function processIM(event, db) {
  const { actions, response_url } = event;
  const action = actions[0];

  const updateMessage = (text) =>
    post(response_url, {
      body: {
        replace_original: "true",
        text,
      },
      json: true,
    });

  const user = db.get("users").find({ id: event.channel.id }).value();

  if (!user) {
    return updateMessage(
      `I'm sorry but something wrong has happened - I don't know who you are. Try again later.`
    );
  }

  if (action.action_id === "reminder-fill") {
    const value = action.value.split("/");
    const dateStr = `${value[3]}-${value[2]}-${value[1]}`;
    const date = new Date(dateStr);

    if (!isToday(date)) {
      const suggestion = `fill all day ${value[1]}-${value[2]}-${value[3]}`;
      return updateMessage(
        `Sorry, but that action has expired, as it's from a past date - Use "${suggestion}" if you still want to fill this day`
      );
    }

    const actionMsg = updateMessage(`Sure - Give me just a few seconds`);
    const result = await fillAllDay(db, user.token, date);

    await actionMsg;
    if (result === "scheduled") {
      return updateMessage(
        `As I can't fill future hours, I've scheduled to fill the day for you tonight.`
      );
    }
    return updateMessage(
      `Done! I've filled all the woffus of ${
        isToday(date) ? "today" : dateStr
      } for you`
    );
  }
  if (action.action_id === "reminder-fill-half") {
    const value = action.value.split("/");
    const dateStr = `${value[3]}-${value[2]}-${value[1]}`;
    const date = new Date(dateStr);

    if (!isToday(date)) {
      const suggestion = `fill half day ${value[1]}-${value[2]}-${value[3]}`;
      return updateMessage(
        `Sorry, but that action has expired, as it's from a past date - Use "${suggestion}" if you still want to fill this day`
      );
    }

    const actionMsg = updateMessage(`Sure - Give me just a few seconds`);
    const result = await fillHalfDay(db, user.token, date);

    await actionMsg;
    if (result === "scheduled") {
      return updateMessage(
        `As I can't fill future hours, I've scheduled to fill the half day for you tonight.`
      );
    }
    return updateMessage(
      `Done! I've filled the woffus of ${
        isToday(date) ? "today" : dateStr
      } (half day) for you`
    );
  }
}

async function sendReminders(db, slackWeb) {
  const now = Date.now();
  const isHalfDay = getDay(now) === 5 && getMonth(now) === 7; // Fridays of August
  const today = format(now, "dd/MM/yyyy");
  if (isWeekend(now)) {
    return;
  }

  const users = db
    .get("users")
    .filter((user) => {
      if (!user.reminder) return false;

      const [hours, minutes] = user.reminder.split(":").map((s) => Number(s));
      const reminder = zonedTimeToUtc(
        set(now, {
          hours,
          minutes,
          seconds: 0,
        }),
        "Europe/Madrid"
      ).getTime();

      const lastReminder = user.lastReminder || user.registered || 0;
      return reminder > lastReminder && reminder <= now;
    })
    .value();

  for (let user of users) {
    const channel = user.id;

    const fillDayBtn = isHalfDay
      ? {
          type: "button",
          text: {
            type: "plain_text",
            text: "Fill half day",
          },
          value: "FillHalfDay/" + today,
          action_id: "reminder-fill-half",
        }
      : {
          type: "button",
          text: {
            type: "plain_text",
            text: "Fill all day",
          },
          value: "FillAllDay/" + today,
          action_id: "reminder-fill",
        };

    const halfDayGreeting = isHalfDay ? `It's an August Friday! :D ` : "";

    await slackWeb.chat.postMessage({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Hey! ${halfDayGreeting}You asked me to remind you about woffu - Do you want to fill all of today\'s woffus or just check in?`,
          },
        },
        {
          type: "actions",
          elements: [
            fillDayBtn,
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Check In",
              },
              value: "CheckIn/" + today,
              action_id: "reminder-action",
            },
          ],
        },
      ],
      channel,
    });

    db.get("users")
      .find(user)
      .assign({
        lastReminder: Date.now(),
      })
      .write();
  }
}

const setupReminders = (db, slackWeb) => {
  sendReminders(db, slackWeb);
  cron.schedule("* * * * *", () => sendReminders(db, slackWeb));
};

module.exports = {
  setupReminders,
  commands: [setupReminderCommand, stopReminderCommand],
  processIM,
  help: [
    "`remind HH:MM`: Set up a daily reminder for woffu",
    "`remind stop`: Stop reminding plz",
  ],
};
