const actions = require('./actions');
const register = require('./register');
const status = require('./status');
const reminders = require('./reminders');

const allModules = [
  actions, register, status, reminders
];

function routes(router, db, slackWeb) {
  allModules.forEach(m => m.routes && m.routes(router, db, slackWeb));
}

async function processMessage(text, user, deps) {
  const { postMessage } = deps;

  if(text.startsWith('test')) {
    text = text.substr('test'.length).trim();
    deps.intratime = {
      ...deps.intratime,
      submitClocking: (...args) => postMessage({
        text: `TEST - submitClocking(${args.map(v => JSON.stringify(v)).join(', ')})`
      }),
      fillAllDay: (...args) => postMessage({
        text: `TEST - fillAllDay(${args.map(v => JSON.stringify(v)).join(', ')})`
      }),
    }
  }

  for(m of allModules) {
    if(!m.commands) continue;

    for(command of m.commands) {
      const result = await command(text, user, deps);
      if(result) {
        return result;
      }
    }
  }

  const commandHelp = allModules.reduce((res, m) => m.help ? [
    ...res,
    ...m.help
  ] : m, []);

  return {
    text: `Possible commands:\n${commandHelp.join(`\n`)}`
  }
}

module.exports = {
  routes,
  processMessage
}
