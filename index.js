const Koa = require('koa');
const app = new Koa();
const router = require('koa-router')();
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { WebClient } = require('@slack/web-api');
const uuid = require('uuid/v4');
const { createReadStream } = require('fs');
const {
    setHours,
    setMinutes,
    setSeconds,
    addDays,
    getDay,
    format
} = require('date-fns');
const cron = require('node-cron');

const oauthToken = process.env.SLACK_TOKEN;

const slackWeb = new WebClient(oauthToken);
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({
    users: [],
    tokens: []
}).write();

/*
commands:
    * help
    * register
    * fill today
    * check in
    * check out
    * break
    * return
    * disable (reminders)
    * enable (reminders)
*/

const intratime = require('./intratime');

router
    .get('/', async (ctx, next) => {
        ctx.body = 'hello! You shouldn\'t be here :)';
    })
    .get('/register', async (ctx, next) => {
        ctx.type = 'html';
        ctx.body = createReadStream('./register.html');
    })
    .post('/register', async (ctx, next) => {
        const { email, pin, token } = ctx.request.body;

        const tokens = db.get('tokens');
        const users = db.get('users');

        const tokenObj = tokens
            .find({ token })
            .value();

        if (!tokenObj) {
            ctx.body = `Sorry - I don't know who you are`;
            return;
        }
        const { userId } = tokenObj;

        let userToken = null;
        try {
            userToken = await intratime.login(email, pin);
        }catch (ex) {
            ctx.body = ex.message;
            return;
        }

        tokens
            .remove(tokenObj)
            .write();

        let userQuery = users
            .find({ id: userId });

        if (userQuery.value()) {
            userQuery
                .assign({
                    token: userToken,
                })
                .write();
        } else {
            let nextReminder = new Date();
            nextReminder = addDays(nextReminder, 1);
            nextReminder.setUTCHours(8);
            nextReminder.setUTCMinutes(0);
            nextReminder.setUTCSeconds(0);
            users
                .push({
                    id: userId,
                    token: userToken,
                    nextReminder: nextReminder.getTime()
                })
                .write();
        }

        ctx.body = 'Success!';

        const channel = userId;
        slackWeb.chat.postMessage({
            text: `I've just registered you, welcome! How can I help?`,
            channel
        });
    })
    .post('/', async (ctx, next) => {
        let body = ctx.request.body;
        if (body.payload) {
            body = JSON.parse(body.payload);
        }

        const {
            type,
            challenge,
            event,
        } = body;

        switch (type) {
            case 'url_verification':
                ctx.body = challenge;
                break;
            case 'event_callback':
                ctx.body = '';
                processEvent(event);
                break;
            case 'interactive_message':
                processIM(body);
                break;
            default:
                console.log(body);
        }
    });

app
    .use(cors())
    .use(bodyParser())
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(8001);

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
    const { actions, original_message, message_ts, channel } = event;
    const action = actions[0];

    if(action.name === 'fill_in') {
        await slackWeb.chat.update({
            channel: channel.id,
            text: original_message.text,
            ts: message_ts,
            attachments: [{
                text: "Fill in all day\nSure! Give me a few seconds.",
                callback_id: "command",
                attachment_type: "default",
                actions: []
            }]
        });
    }
}

const { Action } = intratime;
const commands = {
    "check in": Action.CheckIn,
    "check out": Action.CheckOut,
    "break": Action.Break,
    "return": Action.Return
};

async function processEvent(event) {
    const { text, channel, bot_id, subtype } = event;
    const userId = channel;

    if (bot_id || subtype === 'message_changed') {
        // Ignore messages sent by bots (it could be us!)
        return;
    }

    const user = db
        .get('users')
        .find({ id: userId })
        .value();

    if (!user) {
        const tokens = db
            .get('tokens');

        let tokenObj = tokens.find({ userId }).value();
        if (!tokenObj) {
            tokenObj = {
                userId,
                channel,
                token: uuid(),
                timestamp: new Date().getTime()
            }
            tokens.push(tokenObj).write();
        }
        const { token } = tokenObj;

        return slackWeb.chat.postMessage({
            text: `It seems like you haven't registered yet. Click here to register: https://livewind.freemyip.com/intratime/register?token=${token}`,
            channel
        });
    }

    console.log(event, user);

    if (text.toLocaleLowerCase().includes("fill all day")) {
        await slackWeb.chat.postMessage({
            text: `Sure thing! It will take me a few seconds...`,
            channel
        });

        try {
            await intratime.fillAllDay(user.token);

            await slackWeb.chat.postMessage({
                text: `Great! Made all intratimes of the day!`,
                channel
            });
        } catch(ex) {
            console.error(ex);
            slackWeb.chat.postMessage({
                text: `Something went wrong :/`,
                channel
            });
        }
        return;
    }

    const checkCommand = Object.keys(commands).find(key => text.toLocaleLowerCase().startsWith(key));
    if (checkCommand) {
        const action = commands[checkCommand];
        const params = text.substr(checkCommand.length).trim().split(' ');

        let date = new Date();
        let time = defaultTimes[action].split(':');

        if(params[0]) {
            // Accepts HH:MM:SS or HH:MM
            if(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(params[0])) {
                time = params[0].split(':');
            } else {
                return await slackWeb.chat.postMessage({
                    text: `I don't understand the parameters... try with just "${checkCommand}" or with a valid time (HH:MM:SS)`,
                    channel
                });
            }
        }
        date = setHours(date, Number(time[0]));
        date = setMinutes(date, Number(time[1]));
        time[2] && (date = setSeconds(date, Number(time[2])));

        await slackWeb.chat.postMessage({
            text: `Sure thing! It will take just a second...`,
            channel
        });

        try {
            await intratime.submitClocking(user.token, action, format(date, 'yyyy-MM-dd HH:mm:ss'));

            await slackWeb.chat.postMessage({
                text: `Done! :)`,
                channel
            });
        } catch(ex) {
            console.error(ex);
            slackWeb.chat.postMessage({
                text: `Something went wrong :/\n(Error: ${ex.message})`,
                channel
            });
        }
        return;
    }

    return slackWeb.chat.postMessage({
        text: 'Sorry, I didn\'t get that',
        channel,
    });
}

async function sendReminders() {
    const now = new Date().getTime();
    console.log(`sendReminders`, now);
    const users = db.get('users')
        .filter(user => !user.nextReminder || user.nextReminder <= now)
        .value();

    console.log('users to send reminders: ', users.length);
    for(let user of users) {
        const channel = user.id;

        await slackWeb.chat.postMessage({
            text: `Hey! Do you want to fill all of today\'s intratimes?\nIMPORTANT: This will fill all 4 intratimes of the day with the default hours. Only do it if you haven't done any of the intratimes today, or you'll have duplicates.`,
            channel,
            attachments: [{
                text: "Fill in all day",
                callback_id: "command",
                attachment_type: "default",
                actions: [{
                    name: "fill_in",
                    text: "Yes",
                    type: "button",
                    value: uuid()
                }]
            }]
        });

        let { nextReminder = now } = user;
        nextReminder = new Date(nextReminder);
        nextReminder = addDays(nextReminder, 1);

        // Skip weekends
        const weekDay = getDay(nextReminder);
        if(weekDay == 6) {
            nextReminder = addDays(nextReminder, 2);
        }

        db.get('users')
            .find(user)
            .assign({
                nextReminder: nextReminder.getTime()
            })
            .write();
    }
}

cron.schedule('* * * * *', sendReminders);