const Koa = require('koa');
const app = new Koa();
const router = require('koa-router')();
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { WebClient } = require('@slack/web-api');
const { routes, processMessage } = require('./features');
const { prepareRegisterUrl } = require('./features/register');
const { setupReminders, processIM } = require('./features/reminders');
const intratime = require('./intratime');

const oauthToken = process.env.SLACK_TOKEN;

const slackWeb = new WebClient(oauthToken);
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({
    users: [],
    tokens: []
}).write();

setupReminders(db, slackWeb);

router
    .get('/', async (ctx, next) => {
        ctx.body = 'hello! You shouldn\'t be here :)';
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

routes(router, db, slackWeb);

app
    .use(cors())
    .use(bodyParser())
    .use(router.routes())
    .use(router.allowedMethods());

app.listen(8001);

async function processEvent(event) {
    const { text, channel, bot_id, subtype } = event;
    const insensitiveText = text.toLocaleLowerCase();
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
        const url = prepareRegisterUrl(userId, db);

        return slackWeb.chat.postMessage({
            text: `It seems like you haven't registered yet. Click here to register: ${url}`,
            channel
        });
    }

    const msg = await processMessage(insensitiveText, user, {
        db,
        intratime,
        postMessage: msg => slackWeb.chat.postMessage({
            ...msg,
            channel,
        })
    });

    if(msg) {
        return slackWeb.chat.postMessage({
            ...msg,
            channel,
        });
    }else {
        return slackWeb.chat.postMessage({
            text: 'Sorry, I didn\'t get that',
            channel,
        });
    }
}
