const {
  setSeconds,
  set
} = require("date-fns");

function applyTimeString(date, text) {
  const time = text.split(":");
  date = set(date, {
    hours: Number(time[0]),
    minutes: Number(time[1])
  });
  time[2] && (date = setSeconds(date, Number(time[2])));

  return date;
}
function applyDateString(date, text) {
  const value = text.split("-");
  date = set(date, {
    date: Number(value[0]),
    month: Number(value[1]) - 1,
    year: Number(value[2])
  });

  return date;
}

module.exports = {
  applyTimeString,
  applyDateString
};
