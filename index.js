const config = require("./config.json");

const Client = require("./src/client.js");
const client = new Client({
  username: config.username,
  password: config.password,
  whitelist: [789657845, 4985560815],
  postInterval: "30s"
});

client.login().then(() => {
  client.registerFeed({ name: "dms", feed: "inbox" }, 20000);
});

const error = err => {
  console.error(err)
  process.exit();
};

process.on("uncaughtException", error);
process.on("unhandledRejection", error);


