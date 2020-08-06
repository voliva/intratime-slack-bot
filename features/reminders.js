const { set, isToday, isWeekend, format, getMonth, getDay } = require("date-fns");
const { zonedTimeToUtc } = require('date-fns-tz')
const cron = require("node-cron");
const request = require("request");
const util = require("util");
const post = util.promisify(request.post);
const {
  getStatus,
  Action,
  submitClocking,
  fillAllDay,
  fillHalfDay
} = require("../intratime");

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

async function setupReminderCommand(text, user, { db }) {
  const query = text.split(" ");
  if (query[0] === "remind" && timeRegex.test(query[1])) {
    const time = query[1].split(":");
    const timeString = time.slice(0, 2).join(":");

    const reminders = user.reminders || [];
    if (reminders.includes(timeString)) {
      return {
        text: `You already had a reminder set up for ${timeString}`
      };
    }

    reminders.push(timeString);
    reminders.sort();

    db.get("users")
      .find(user)
      .assign({
        reminders
      })
      .write();

    return {
      text: `Sure! I'll remind you about intratime every day at ${timeString}`
    };
  }
}

async function listRemindersCommand(text, user) {
  const query = text.split(" ");

  if (query[0] === "remind" && query[1] === "list") {
    const reminders = user.reminders || [];
    if (!reminders.length) {
      return {
        text: `You don't have any reminder set up`
      };
    }

    return {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Here's the list of the reminders you've set up:\n\n${reminders
              .map(time => `- ${time}`)
              .join(`\n`)}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Select a reminder to delete from the list`
          },
          accessory: {
            type: "static_select",
            action_id: "delete-reminder",
            placeholder: {
              type: "plain_text",
              text: "Delete a reminder"
            },
            options: reminders.map(time => ({
              text: {
                type: "plain_text",
                text: time
              },
              value: time
            }))
          }
        }
      ]
    };
  }
}

async function processIM(event, db) {
  const { actions, response_url } = event;
  const action = actions[0];

  const updateMessage = text =>
    post(response_url, {
      body: {
        replace_original: "true",
        text
      },
      json: true
    });

  const user = db
    .get("users")
    .find({ id: event.channel.id })
    .value();

  if (!user) {
    return updateMessage(
      `I'm sorry but something wrong has happened - I don't know who you are. Try again later.`
    );
  }

  if (action.action_id === "delete-reminder") {
    const reminder = action.selected_option.value;

    let reminders = user.reminders || [];
    reminders = reminders.filter(time => time !== reminder);

    db.get("users")
      .find(user)
      .assign({
        reminders
      })
      .write();

    await updateMessage(`Done - I won't remind you at ${reminder}`);
  }
  if (action.action_id === "reminder-action") {
    const value = action.value.split("/");
    const date = new Date(`${value[3]}-${value[2]}-${value[1]}`);

    if (!isToday(date)) {
      return updateMessage(
        `Sorry, but that action has expired - Use regular commands instead`
      );
    }

    const actionMsg = updateMessage(`Sure - Give me just a second`);
    await submitClocking(user.token, Action[value[0]], new Date(), false);

    await actionMsg;
    return updateMessage(`Done! I've performed the action ${value[0]} for you`);
  }
  if (action.action_id === "reminder-fill") {
    const value = action.value.split("/");
    const dateStr = `${value[3]}-${value[2]}-${value[1]}`;
    const date = new Date(dateStr);

    const actionMsg = updateMessage(`Sure - Give me just a few seconds`);
    await fillAllDay(user.token, date);

    await actionMsg;
    return updateMessage(
      `Done! I've filled all the intratimes of ${
      isToday(date) ? "today" : dateStr
      } for you`
    );
  }
  if (action.action_id === "reminder-fill-half") {
    const value = action.value.split("/");
    const dateStr = `${value[3]}-${value[2]}-${value[1]}`;
    const date = new Date(dateStr);

    const actionMsg = updateMessage(`Sure - Give me just a few seconds`);
    await fillHalfDay(user.token, date);

    await actionMsg;
    return updateMessage(
      `Done! I've filled the intratimes of ${
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
    .filter(user => {
      const todayReminders = (user.reminders || []).map(time => {
        const [hours, minutes] = time.split(":").map(s => Number(s));
        return zonedTimeToUtc(set(now, {
          hours,
          minutes,
          seconds: 0
        }), 'Europe/Madrid').getTime();
      });
      const lastReminder = user.lastReminder || user.registered || 0;
      return todayReminders.some(time => time > lastReminder && time <= now);
    })
    .value();

  for (let user of users) {
    const channel = user.id;

    const status = await getStatus(user.token);
    if (!status) {
      console.error("sendReminders - Unkown status for user ", user.id);
      continue;
    }

    const statusDate = new Date(status.date);
    if (isToday(statusDate)) {
      const nextAction =
        status.type === Action.CheckIn
          ? "Break"
          : status.type === Action.Break
            ? "Return"
            : status.type === Action.Return
              ? "CheckOut"
              : undefined;

      if (!nextAction) {
        await slackWeb.chat.postMessage({
          text: `Hey! You asked me to remind you for intratime now, but it seems like you've already checked out for today, so I can't really help you.`,
          channel
        });
      } else {
        await slackWeb.chat.postMessage({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Hey! You asked me to remind you about intratime - Based on your status, you can now ${nextAction}`
              }
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: nextAction + " (Now)"
                  },
                  value: nextAction + "/" + today,
                  action_id: "reminder-action"
                }
              ]
            }
          ],
          channel
        });
      }
    } else {
      const fillDayBtn = isHalfDay ? {
        type: "button",
        text: {
          type: "plain_text",
          text: "Fill half day"
        },
        value: "FillHalfDay/" + today,
        action_id: "reminder-fill-half"
      } : {
          type: "button",
          text: {
            type: "plain_text",
            text: "Fill all day"
          },
          value: "FillAllDay/" + today,
          action_id: "reminder-fill"
        };

      const halfDayGreeting = isHalfDay ? `It's an August Friday! :D ` : '';

      await slackWeb.chat.postMessage({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Hey! ${halfDayGreeting}You asked me to remind you about intratime - Do you want to fill all of today\'s intratimes or just check in?`
            }
          },
          {
            type: "actions",
            elements: [
              fillDayBtn,
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Check In"
                },
                value: "CheckIn/" + today,
                action_id: "reminder-action"
              }
            ]
          }
        ],
        channel
      });
    }

    db.get("users")
      .find(user)
      .assign({
        lastReminder: Date.now()
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
  commands: [setupReminderCommand, listRemindersCommand],
  processIM,
  help: [
    "`remind HH:MM`: Set up a daily reminder for intratime",
    "`remind list`: List the reminders set up to delete them"
  ]
};
