const { applyDateString } = require("./utils");

const dateRegex = /^([0-2][0-9]|3[0-1])-(0[0-9]|1[0-2])-\d{4}$/;

async function fillInDay(text, user, { db, postMessage, intratime }) {
  if (text.startsWith("fill all day")) {
    const params = text.substr("fill all day".length).trim().split(" ");

    let date = new Date();
    if (params.length && params[0]) {
      if (!dateRegex.test(params[0])) {
        return {
          text: `I didn't understand that... if you want to specify a day, you should use the format DD-MM-YYYY`,
        };
      }
      date = applyDateString(date, params[0]);
    }

    await postMessage({
      text: `Sure thing! It will take me a few seconds...`,
    });

    try {
      const result = await intratime.fillAllDay(db, user.token, date);

      if (result === "scheduled") {
        return {
          text: `As I can't fill future hours, I've scheduled to fill the day for you tonight.`,
        };
      }

      return {
        text: `Great! Made all intratimes of the day!`,
      };
    } catch (ex) {
      console.log(ex);
      return {
        text: `Something went wrong :/ - ${ex.message}`,
      };
    }
  }
}

async function fillInHalfDay(text, user, { db, postMessage, intratime }) {
  if (text.startsWith("fill half day")) {
    const params = text.substr("fill half day".length).trim().split(" ");

    let date = new Date();
    if (params.length && params[0]) {
      if (!dateRegex.test(params[0])) {
        return {
          text: `I didn't understand that... if you want to specify a day, you should use the format DD-MM-YYYY`,
        };
      }
      date = applyDateString(date, params[0]);
    }

    await postMessage({
      text: `Sure thing! It will take me a few seconds...`,
    });

    try {
      const result = await intratime.fillHalfDay(db, user.token, date);

      if (result === "scheduled") {
        return {
          text: `As I can't fill future hours, I've scheduled to fill half the day for you tonight.`,
        };
      }

      return {
        text: `Great! Made all intratimes of the half day!`,
      };
    } catch (ex) {
      console.log(ex);
      return {
        text: `Something went wrong :/ - ${ex.message}`,
      };
    }
  }
}

// Slack command: "fill work day [DD-MM-YYYY] [8]"
// Supported forms:
//   fill work day                -> today, default start time (09:00 Mon–Thu)
//   fill work day 8              -> today, start at 08:00 (Mon–Thu only)
//   fill work day DD-MM-YYYY     -> specific date, default start time
//   fill work day DD-MM-YYYY 8   -> specific date, start at 08:00 (Mon–Thu)
//
// "8" means: use 08:00–13:00 / 14:00–17:30 instead of the default Mon–Thu times.
async function fillWorkDayCommand(text, user, { db, postMessage, intratime }) {
  if (!text.startsWith("fill work day")) {
    return;
  }

  const rawParams = text.substr("fill work day".length).trim();
  const params = rawParams ? rawParams.split(/\s+/) : [];

  let date = new Date();
  let startAt8 = false;

  // Handle parameter variations
  if (params.length === 1) {
    if (dateRegex.test(params[0])) {
      // User specified only the date
      date = applyDateString(date, params[0]);
    } else if (params[0] === "8") {
      // User wants the 08:00 shift on Mon–Thu
      startAt8 = true;
    } else {
      return {
        text:
          "I didn't understand that... Use `fill work day [DD-MM-YYYY] [8]` (the last `8` means start at 08:00).",
      };
    }
  } else if (params.length >= 2) {
    // User provided both date and "8"
    if (!dateRegex.test(params[0]) || params[1] !== "8") {
      return {
        text:
          "Incorrect format. Use `fill work day [DD-MM-YYYY] 8` if you want to start at 08:00.",
      };
    }
    date = applyDateString(date, params[0]);
    startAt8 = true;
  }

  await postMessage({
    text: `Sure thing! It will take me a few seconds...`,
  });

  try {
    const result = await intratime.fillWorkDay(db, user.token, date, {
      startAt8,
    });

    if (result === "scheduled") {
      return {
        text: `As I can't fill future hours, I've scheduled the work day for tonight.`,
      };
    }

    return {
      text: `Great! Filled the work day with the new schedule!`,
    };
  } catch (ex) {
    console.log(ex);
    return {
      text: `Something went wrong :/ - ${ex.message}`,
    };
  }
}

// Slack command: "fill work range <FROM> <TO> [8]"
// - Fills all work days (Mon–Fri) between FROM and TO (inclusive)
// - FROM and TO must be in DD-MM-YYYY format
// - Optional "8" at the end to use the 08:00–17:30 shift on Mon–Thu
//
// Examples:
//   fill work range 01-11-2025 30-11-2025
//   fill work range 01-11-2025 30-11-2025 8
async function fillWorkRangeCommand(text, user, { db, postMessage, intratime }) {
  if (!text.startsWith("fill work range")) {
    return;
  }

  const rawParams = text.substr("fill work range".length).trim();
  const params = rawParams ? rawParams.split(/\s+/) : [];

  // We need at least FROM and TO
  if (params.length < 2) {
    return {
      text:
        "Usage: `fill work range FROM TO [8]`. Dates must be in DD-MM-YYYY. Optional `8` to start at 08:00 on Mon–Thu.",
    };
  }

  const fromStr = params[0];
  const toStr = params[1];
  const startAt8 = params[2] === "8";

  if (!dateRegex.test(fromStr) || !dateRegex.test(toStr)) {
    return {
      text:
        "Dates must be in DD-MM-YYYY format.\nExample: `fill work range 01-11-2025 30-11-2025 8`",
    };
  }

  // Convert Slack-style date strings into JS Date objects
  let today = new Date();
  let startDate = applyDateString(today, fromStr);
  let endDate = applyDateString(today, toStr);

  // Swap if inverted (so the user can't break it)
  if (startDate > endDate) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  await postMessage({
    text: `Got it! Filling all work days from ${fromStr} to ${toStr} (Mon–Fri only)...`,
  });

  try {
    await intratime.fillWorkRange(db, user.token, startDate, endDate, {
      startAt8,
    });

    return {
      text: `Done! Filled all work days (Mon–Fri) from ${fromStr} to ${toStr}${
        startAt8 ? ", starting at 08:00 on Mon–Thu." : "."
      }`,
    };
  } catch (ex) {
    console.log(ex);
    return {
      text: `Something went wrong while filling the work range :/ - ${ex.message}`,
    };
  }
}

module.exports = {
  // Add the new work-day and work-range commands
  commands: [
    fillInDay,
    fillInHalfDay,
    fillWorkDayCommand,
    fillWorkRangeCommand,
  ],
  help: [
    "`fill all day [DD-MM-YYYY]`: Performs all actions of the day using the classic default times (check in 09:00, break 13:00, return 14:00, check out 18:00). Accepts an optional date.",
    "`fill half day [DD-MM-YYYY]`: Performs the half-day actions (check in 10:00, check out 14:00). Accepts an optional date.",
    "`fill work day [DD-MM-YYYY] [8]`: Fills a work day using the new schedule: Mon–Thu 8h30 (09–13 / 14–18:30 or 08–13 / 14–17:30 if you add `8`), Friday 6h (09–13 / 14–16). If it's today, it will be scheduled for tonight.",
    "`fill work range FROM TO [8]`: Fills all work days (Mon–Fri) between FROM and TO (DD-MM-YYYY). Optional `8` means starting at 08:00 on Mon–Thu.",
  ],
};

