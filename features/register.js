const { login } = require("../intratime");
const uuid = require("uuid/v4");

function prepareRegisterUrl(userId, db) {
  const tokens = db.get("tokens");

  let tokenObj = tokens.find({ userId }).value();
  if (!tokenObj) {
    tokenObj = {
      userId,
      channel,
      token: uuid(),
      timestamp: new Date().getTime()
    };
    tokens.push(tokenObj).write();
  }
  const { token } = tokenObj;

  return `https://livewind.freemyip.com/intratime/register?token=${token}`;
}

const { createReadStream } = require("fs");

function routes(router, db, slackWeb) {
  router
    .get("/register", async (ctx, next) => {
      ctx.type = "html";
      ctx.body = createReadStream("./register.html");
    })
    .post("/register", async (ctx, next) => {
      const { email, pin, token } = ctx.request.body;

      const tokens = db.get("tokens");
      const users = db.get("users");

      const tokenObj = tokens.find({ token }).value();

      if (!tokenObj) {
        ctx.body = `Sorry - I don't know who you are`;
        return;
      }
      const { userId } = tokenObj;

      let userToken = null;
      try {
        userToken = await login(email, pin);
      } catch (ex) {
        ctx.body = ex.message;
        return;
      }

      tokens.remove(tokenObj).write();

      let userQuery = users.find({ id: userId });

      if (userQuery.value()) {
        userQuery
          .assign({
            token: userToken
          })
          .write();
      } else {
        users
          .push({
            id: userId,
            token: userToken
          })
          .write();
      }

      ctx.body = "Success!";

      const channel = userId;
      slackWeb.chat.postMessage({
        text: `I've just registered you, welcome! How can I help?`,
        channel
      });
    });
}

async function registerCommand(text, user, {db}) {
  if (text.startsWith("register")) {
    const url = prepareRegisterUrl(userId, db);

    return {
      text: `Sure thing! Use this link to register your credentials: ${url}`
    };
  }

  return false;
}

module.exports = {
  prepareRegisterUrl,
  routes,
  commands: [registerCommand],
  help: ['register: Initializes intratime\'s token']
};
