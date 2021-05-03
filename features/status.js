const { Action } = require("../intratime");

async function statusCommand(text, user, { intratime }) {
  if (text.startsWith("status")) {
    try {
      const status = await intratime.getStatus(user.token);

      if (!status) {
        return {
          text: `I couldn't fetch your status :(`,
        };
      }

      const action = Object.entries(Action).find(
        ([, value]) => value === status.type
      )[0];

      return {
        text: `Your last action was a "${action}" on ${status.date}`,
      };
    } catch (ex) {
      return {
        text: `I couldn't fetch your status :(`,
      };
    }
  }

  return false;
}

module.exports = {
  commands: [statusCommand],
  help: ["`status`: Gets the last intratime submitted"],
};
