const intratime = require("./intratime");
const { applyTimeString } = require("./features/utils");

const queue = [];

async function submitClocking(userId, ...args) {
    if (queue.length) {
        queue.push({ userId, args });
        return queue.length;
    }

    try {
        await intratime.submitClocking(...args);
        return 0;
    } catch (ex) {
        if (!errorIsRateLimit(ex)) {
            throw ex;
        }
        queue.push({ userId, args });
        return queue.length;
    }
}

async function flushQueue(slackWeb) {
    const successes = {};
    const failures = {};

    while (queue.length) {
        const [head] = queue;

        try {
            await intratime.submitClocking(...head.args);
            queue.splice(0, 1);
            successes[head.userId] = successes[head.userId] || [];
            successes[head.userId].push(`${head.args[1]} ${head.args[2]}`);
        } catch (ex) {
            if (errorIsRateLimit(ex)) {
                break;
            }
            failures[head.userId] = failures[head.userId] || [];
            failures[head.userId].push(`${head.args[1]} ${head.args[2]} ${ex.message}`);
        }
    }

    for (let channel of Object.keys(successes)) {
        const calls = successes[channel];
        await slackWeb.chat.postMessage({
            text: `I've just successfully submited what was in my queue: ${calls.join(', ')}`,
            channel
        });
    };

    for (let channel of Object.keys(failures)) {
        const calls = failures[channel];
        await slackWeb.chat.postMessage({
            text: `I tried to submit what was in my queue but it failed: ${calls.join(', ')}`,
            channel
        });
    };
}

const defaultTimes = {
    [intratime.Action.CheckIn]: "09:00:00",
    [intratime.Action.Break]: "13:00:00",
    [intratime.Action.Return]: "14:00:00",
    [intratime.Action.CheckOut]: "18:00:00"
};

async function fillAllDay(userId, token, date) {
    const values = Object.entries(defaultTimes);
    let queuePos = 0;
    for (let [action, time] of values) {
        const dateTime = applyTimeString(date, time);
        queuePos = await submitClocking(userId, token, action, dateTime, true);
    }
    return queuePos;
}

function errorIsRateLimit(ex) {
    return ex.message === 'Rate limit exceeded';
}

module.exports = {
    submitClocking,
    flushQueue,
    fillAllDay
};
