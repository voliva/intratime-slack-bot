
const request = require('request');
const util = require('util');
const post = util.promisify(request.post);

const Action = {
    CheckIn: 0,
    Return: 3, // => Break
    CheckOut: 1, // => Return
    Break: 2, // => CheckOut
};

const defaultTimes = {
    [Action.CheckIn]: '09:00:00',
    [Action.Break]: '13:00:00',
    [Action.Return]: '14:00:00',
    [Action.CheckOut]: '18:00:00',
}

async function login(user, pin) {
    const result = await post('https://newapi.intratime.es/api/user/login', {
        form: {
            user,
            pin
        }
    });

    const resultObj = JSON.parse(result.body);

    if(resultObj.status_code === 401) {
        throw new Error(`Invalid credentials`);
    }
    if(!resultObj.USER_TOKEN) {
        throw new Error(`Unknown error when logging in.\n${resultObj}`);
    }

    return resultObj.USER_TOKEN;
}

async function submitClocking(token, action, time) {
    const resultObj = await post('https://newapi.intratime.es/api/user/clocking', {
        form: {
            user_action: `${action}`,
            user_timestamp: time,
            user_gps_coordinates: '41.4050371,2.1926044',
            user_use_server_time: 'false'
        },
        headers: {
            token
        }
    });

    if(resultObj.statusCode > 400) {
        let serverMessage = '';
        try {
            serverMessage = JSON.parse(resultObj.body).message;
        }catch(ex) {}

        throw new Error(`Service returned error: ${resultObj.statusCode} ${resultObj.statusMessage}. ${serverMessage}`);
    }
    if(resultObj.statusCode !== 201) {
        throw new Error(`Service returned unexpected status: ${resultObj.statusCode} ${resultObj.body}`);
    }
    return true;
}

async function fillAllDay(token) {
    const values = Object.values(defaultTimes);
    for(let [action, time] of values) {
        await submitClocking(token, action, time);
    }
}

module.exports = {
    login,
    submitClocking,
    fillAllDay,
    Action
};
