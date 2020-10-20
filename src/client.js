const { IgApiClient } = require("instagram-private-api");
const { EventEmitter } = require("events");
const Endb = require("endb");
const FeedManager = require("./FeedManager/index.js");
const PostManager = require("./PostManager");
const path = require("path");
const winston = require("winston");
const fs = require("fs");

class Client extends EventEmitter {
  constructor(options) {
    super();
    /* If no credentials given throw an error */
    if (typeof options !== "object")
      throw new Error("Object with credentials must be passed to client.");
    if (!options.username || !options.password)
      throw new Error("Username and password must be provided.");

    /* Instagram Username */
    Object.defineProperty(this, "_username", {
      value: options.username,
      enumerable: false,
      writable: false
    });

    /*Instagram Password */
    Object.defineProperty(this, "_password", {
      value: options.password,
      enumerable: false,
      writable: false
    });

    /* Instagram Account after login */
    this.ig = null;

    /* Object returned from auth method */
    this.auth = null;

    /* Check if database directory exists */
    this._check("./src/storage");

    /* Create Sqlite DB */
    this.db = new Endb(
      `sqlite://${path.join(__dirname, "./storage/storage.sqlite")}`
    );

    /* Create winston logger */
    this.logger = winston.createLogger({
      transports: [
        new winston.transports.Console({ format: winston.format.simple() })
      ]
    });

    /* Listen for new posts, etc */
    this._feedManager = new FeedManager(this);

    /* Post Manager */
    this.posts = null;

    /* Whitelisted Instagram IDS */
    this.whitelist = options.whitelist || [];

    /* Specify default caption */
    this.defaultCaption = options.defaultCaption || null;

    /* How often to post */
    this.postInterval = options.postInterval || "1hr";

    /* Handle New Posts */
    this.on("inbox", this._handlePost);
  }

  async login() {
    this.logger.log({
      level: "info",
      message: "Beginning login"
    });
    /* Instantiate instagram client */
    this.ig = new IgApiClient();

    /* Generate device */
    this.ig.state.generateDevice(this._username);

    /* login */
    this.auth = await this.ig.account.login(this._username, this._password);

    this.logger.log({
      level: "info",
      message: `Successfully logged in`
    });

    /* Initialize Post Manager */
    this.posts = new PostManager(this);

    return this;
  }

  async registerFeed(options, interval = 600000) {
    if (typeof options !== "object")
      throw new Error("Must provide options when registering feed.");

    return await this._feedManager.register(options, interval);
  }

  _handlePost(data) {
    for (const threads of data) {
      threads.forEach((thread, i) => {
        if (thread.item_type === "text") return;

        const _temp = {};
        const _captionThread = threads[i - 1];

        if (_captionThread && _captionThread.item_type === "text")
          _temp.text = this._parse(_captionThread.text);

        _temp.timestamp = thread.timestamp;
        /* Handle Media send photo / video from user */
        if (thread.item_type === "media_share") {
          /* Handle Videos */
          if (thread.media_share.media_type === 2) {
            _temp.url = thread.media_share.video_versions[0].url;
            _temp.coverImage = thread.media_share.image_versions2.candidates[0].url;
            _temp.type = "video";
          } else if (thread.media_share.media_type === 1) {
            /* Handle Photos */
            _temp.url = thread.media_share.image_versions2.candidates[0].url;
            _temp.type = "photo";
          } else if (thread.media_share.media_type === 8) {
            /* Handle Carousel */
            _temp.posts = thread.media_share.carousel_media;
            _temp.type = "carousel";
          } else {
            return;
          }
        } else {
          /* Handle Media Send photo / video */
          return;
        }
        this.posts.add(_temp);
      });
    }
  }

  _check(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  }

  _parse(str) {
    const _commands = {};
    str
      .split("++")
      .slice(1)
      .map(
        s =>
          (_commands[s.split(/ +/g)[0].toLowerCase()] = s
            .split(/ +/g)
            .slice(1)
            .join(" ")
            .trim())
      );
    return Object.keys(_commands).length ? _commands : null;
  }
}

module.exports = Client;
