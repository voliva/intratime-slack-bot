const { submitClocking, Action } = require("./intratime");

const hoursAgo = new Date();
hoursAgo.setTime(hoursAgo.getTime() - 4 * 60 * 60 * 1000);

submitClocking("token", Action.CheckIn, new Date()).then(
  console.log,
  console.error
);
