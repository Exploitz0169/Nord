const fs = require("fs");

class FeedManager {
  constructor(client) {
    this.client = client;

    /* Supported types of feeds */
    this.types = ["inbox"];

    /* Store all feeds in memory */
    this.feeds = new Map();

    /* Store all handlers */
    this.handlers = new Map();

    /* Store all intervals */
    this.intervals = {};

    /* Register handlers */
    this.init();
  }

  /* Return map of all feeds */
  get list() {
    return this.feeds;
  }

  /* Initialize feed handlers */
  init() {
    this.client.logger.log({
      level: "info",
      message: "Initializing FeedManager"
    });
    const files = fs
      .readdirSync("./src/FeedManager/handlers")
      .filter(file => file.endsWith(".js"));
    for (const file of files) {
      const Handler = require(`./handlers/${file}`);
      const handler = new Handler();
      this.handlers.set(handler.name, handler);
    }
  }

  /* Register new feed */
  async register(options, interval) {
    return new Promise(async (resolve, reject) => {
      if (!options.name) reject("Feed name expected.");
      if (!options.feed) reject("Feed type expected.");
      if (!this.types.includes(options.feed))
        reject(`Unsupported feed type give. Supported: ${this.types.join(", ")}`);

      if (typeof interval !== "number")
        reject(`Interval expected number. Got: ${typeof interval}`);

      if (this.feeds.get(options.name))
        reject("Feed with same name already registered.");

      this.client.logger.log({
        level: "info",
        message: "New feed registered"
      });
      this.feeds.set(options.name, options);
      this._createInterval(options.name, interval, options);

      const handler = this.handlers.get(options.feed);
      if (!handler) reject("No handler found for this type.");
      await handler.handle(this.client, options);

      resolve(true);
    });
  }

  /* Delete feed */
  delete(feed) {
    if (!this.feeds.get(feed)) return undefined;

    this.feeds.delete(feed);
    this._clearInterval(feed);

    return true;
  }

  /* Get handler and send it info */
  handle(data) {
    const feed = this.feeds.get(data.name);
    if (!feed) return;

    const handler = this.handlers.get(feed.feed);
    if (!handler) return;

    handler.handle(this.client, data);
  }

  /* Delete all feeds */
  deleteAll() {
    this.feeds.forEach(feed => this.delete(feed));
    return true;
  }

  /* Create interval and store it */
  _createInterval(key, time, options) {
    if (this.intervals[key]) return;
    this.intervals[key] = setInterval(() => {
      this.handle(options);
    }, time);
  }

  /* Delete Interval */
  _clearInterval(key) {
    const interval = this.intervals[key];
    if (!interval) return;

    clearInterval(interval);
    delete this.intervals[key];
  }
}

module.exports = FeedManager;
