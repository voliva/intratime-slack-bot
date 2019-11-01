const {
  setHours,
  setMinutes,
  setSeconds,
  setDate,
  setMonth,
  setYear
} = require('date-fns');

function applyTimeString(date, text) {
  const time = text.split(':');
  date = setHours(date, Number(time[0]));
  date = setMinutes(date, Number(time[1]));
  time[2] && (date = setSeconds(date, Number(time[2])));

  return date;
}
function applyDateString(date, text) {
  const value = text.split('-');
  date = setDate(date, Number(value[0]));
  date = setMonth(date, Number(value[1]) - 1);
  date = setYear(date, Number(value[2]));

  return date;
}

module.exports = {
  applyTimeString,
  applyDateString
};
