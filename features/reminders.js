const uuid = require("uuid/v4");
const { addDays, getDay } = require("date-fns");
const cron = require("node-cron");
const request = require('request');
const util = require('util');
const post = util.promisify(request.post);

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

async function setupReminderCommand(text, user, { db }) {
  const query = text.split(' ');
  if(query[0] === 'remind' && timeRegex.test(query[1])) {
    const time = query[1].split(':');
    const timeString = time.slice(0, 2).join(':');

    const reminders = user.reminders || [];
    if(reminders.includes(timeString)) {
      return {
        text: `You already had a reminder set up for ${timeString}`,
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
      text: `Sure! I'll remind you about intratime every day at ${timeString}`,
    };
  }
}

async function listRemindersCommand(text, user) {
  const query = text.split(' ');

  if(query[0] === 'remind' && query[1] === 'list') {
    const reminders = user.reminders || [];
    if(!reminders.length) {
      return {
        text: `You don't have any reminder set up`,
      };
    }

    return {
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Here's the list of the reminders you've set up:\n\n${
            reminders.map(time => `* ${time}`).join(`\n`)
          }`
        }
      }, {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Select a reminder to delete from the list`
        },
        accessory: {
          type: 'static_select',
          action_id: 'delete-reminder',
          placeholder: {
            type: 'plain_text',
            text: 'Delete a reminder'
          },
          options: reminders.map(time => ({
            text: {
              type: 'plain_text',
              text: time
            },
            value: time
          }))
        }
      }]
    }
  }
}

async function processIM(event, db) {
  const { actions, response_url } = event;
  const action = actions[0];

  const user = db
    .get('users')
    .find({ id: event.channel.id })
    .value();

  if(!user) {
    return;
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

    await post(response_url, {
      body: {
        replace_original: "true",
        text: `Done - I won't remind you at ${reminder}`
      },
      json: true
    });
  }
}

async function sendReminders(db, slackWeb) {
  const now = new Date().getTime();
  console.log(`sendReminders`, now);

  const users = db
    .get("users")
    .filter(user => !user.nextReminder || user.nextReminder <= now)
    .value();

  console.log("users to send reminders: ", users.length);
  for (let user of users) {
    const channel = user.id;

    await slackWeb.chat.postMessage({
      text: `Hey! Do you want to fill all of today\'s intratimes?\nIMPORTANT: This will fill all 4 intratimes of the day with the default hours. Only do it if you haven't done any of the intratimes today, or you'll have duplicates.`,
      channel,
      attachments: [
        {
          text: "Fill in all day",
          callback_id: "command",
          attachment_type: "default",
          actions: [
            {
              name: "fill_in",
              text: "Yes",
              type: "button",
              value: uuid()
            }
          ]
        }
      ]
    });

    let { nextReminder = now } = user;
    nextReminder = new Date(nextReminder);
    nextReminder = addDays(nextReminder, 1);

    // Skip weekends
    const weekDay = getDay(nextReminder);
    if (weekDay == 6) {
      nextReminder = addDays(nextReminder, 2);
    }

    db.get("users")
      .find(user)
      .assign({
        nextReminder: nextReminder.getTime()
      })
      .write();
  }
}

const setupReminders = (db, slackWeb) =>
  cron.schedule("* * * * *", () => sendReminders(db, slackWeb));

module.exports = {
  setupReminders,
  commands: [setupReminderCommand, listRemindersCommand],
  processIM,
  help: [
    '`remind HH:MM`: Set up a daily reminder for intratime',
    '`remind list`: List the reminders set up to delete them'
  ]
};
