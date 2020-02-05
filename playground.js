const { login, getStatus, submitClocking } = require('./intratime');
const request = require("request");
const util = require("util");
const get = util.promisify(request.get);
const { zonedTimeToUtc } = require('date-fns-tz');

console.log(zonedTimeToUtc(new Date(), 'Europe/Madrid'));
console.log(new Date());