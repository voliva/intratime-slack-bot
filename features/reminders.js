const uuid = require("uuid/v4");
const { addDays, getDay } = require("date-fns");
const cron = require("node-cron");

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

module.exports = {
  setupReminders,
  // commands to setup reminders
  processIM
};
