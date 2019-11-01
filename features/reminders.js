const uuid = require("uuid/v4");
const { addDays, getDay } = require("date-fns");
const cron = require("node-cron");

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

async function processIM(event) {
  /* { type: 'interactive_message',
  actions: [ { name: 'fill_name', type: 'button', value: 'fill_value' } ],
  callback_id: 'command',
  team: { id: 'TMRETC7EV', domain: 'intratime-oli-test' },
  channel: { id: 'DMXFTAUPN', name: 'directmessage' },
  user: { id: 'UN0228EKY', name: 'olivarra1' },
  action_ts: '1567496853.329072',
  message_ts: '1567434485.004800',
  attachment_id: '1',
  token: 'Rkl3KuWkbVsPNZGZidNYSgmj',
  is_app_unfurl: false,
  original_message: 
   { type: 'message',
     subtype: 'bot_message',
     text: 'I didn\'t get that, select below or try again',
     ts: '1567434485.004800',
     username: 'Intratime',
     bot_id: 'BMZRKEH0X',
     attachments: [ [Object] ] },
  response_url: 'https://hooks.slack.com/actions/TMRETC7EV/733838577570/C5PPhDtbrKErUDMsA8DbiU4b',
  trigger_id: '746141619012.739503415505.f44b716f6f4e1ecb63e08ab5a2abbfc2' }
  */
  const { actions, original_message, message_ts, channel } = event;
  const action = actions[0];

  if (action.name === "fill_in") {
    await slackWeb.chat.update({
      channel: channel.id,
      text: original_message.text,
      ts: message_ts,
      attachments: [
        {
          text: "Fill in all day\nSure! Give me a few seconds.",
          callback_id: "command",
          attachment_type: "default",
          actions: []
        }
      ]
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
