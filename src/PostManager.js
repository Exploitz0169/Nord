const ms = require("ms");
const { get } = require("request-promise");
const fs = require("fs");
const coverImage = fs.readFileSync("./src/cover.jpg");

class PostManager {
  constructor(client) {
    /* Client and db from client.js */
    this.client = client;
    this.db = client.db;

    /* Queue  cache */
    this.queue = [];

    /* Initialize cache */
    this.init();

    /* Create an interval to upload to instagram */
    setInterval(this._upload.bind(this), ms(client.postInterval));
  }

  /* Update cache */
  async init() {
    this.client.logger.log({
      level: "info",
      message: "Initializing PostManager"
    });
    const _queue = await this.db.get("post_queue");
    if (_queue) this.queue = _queue;
  }

  /* Add posts to cache and db */
  async add(obj) {
    this.client.logger.log({
      level: "info",
      message: `${obj.type} added to queue`
    });
    this.queue.push(obj);
    await this.db.set("post_queue", this.queue);
  }

  /* Upload posts to instagram */
  async _upload() {
    if (!this.queue.length)
      return this.client.logger.log({
        level: "warn",
        message: "No items in queue; not posting"
      });

    /* Sort to first added */
    this.queue = this.queue.sort(
      (a, b) => parseInt(a.timestamp) - parseInt(b.timestamp)
    );
    const _post = this.queue[0];
    const _caption = _post.text ? _post.text.caption : null;

    this.client.logger.log({
      level: "info",
      message: `Posting type ${_post.type}`
    });

    if (_post.type === "carousel") return this._uploadCarousel(_post, _caption);

    const request = await get({
      url: _post.url,
      encoding: null
    }).catch(() =>
      this.client.logger.log({
        level: "error",
        message: "Error while fetching post with request"
      })
    );

    if (request) {
      const buffer = Buffer.from(request, "binary");

      /* Handle if post is video */
      if (_post.type === "video") {
        this.client.ig.publish
          .video({
            video: buffer,
            coverImage: await this.getCoverImage(_post.coverImage),
            caption: _caption
          })
          .then(() =>
            this.client.logger.log({
              level: "info",
              message: "Successfully posted video"
            })
          )
          .catch(err =>
            this.client.logger.log({
              level: "error",
              message: `Error posting video: ${err}`
            })
          );
      } else if (_post.type === "photo") {
        /* Handle if post is an image */
        this.client.ig.publish
          .photo({
            file: buffer,
            caption: _caption
          })
          .then(() =>
            this.client.logger.log({
              level: "info",
              message: "Successfully posted image"
            })
          )
          .catch(err =>
            this.client.logger.log({
              level: "error",
              message: `Error posting image: ${err}`
            })
          );
      }
    }

    this._postUpload();
  }

  async _uploadCarousel(post, caption) {
    const items = [];

    for (const p of post.posts) {
      let props;
      const request = await get({
        url: this.getUrl(p),
        encoding: null
      }).catch(() =>
        this.client.logger.log({
          level: "error",
          message: "Error while fetching post with request"
        })
      );

      if (!request) return;

      const buffer = Buffer.from(request, "binary");

      if (p.media_type === 2) {
        props = {
          video: buffer,
          coverImage: await this.getCoverImage(p)
        };
      } else {
        props = {
          file: buffer
        };
      }

      items.push(props);
    }

    this.client.ig.publish
      .album({
        items,
        caption
      })
      .then(() =>
        this.client.logger.log({
          level: "info",
          message: "Successfully posted carousel"
        })
      )
      .catch(err =>
        this.client.logger.log({
          level: "error",
          message: `Error posting carousel: ${err}`
        })
      );

    this._postUpload();
  }

  getUrl(post) {
    return post.media_type === 2
      ? post.video_versions[0].url
      : post.image_versions2.candidates[0].url;
  }

  async getCoverImage(post) {
    const request = await get({
      url:
        typeof post === "string"
          ? post
          : post.image_versions2.candidates[0].url,
      encoding: null
    }).catch(() =>
      this.client.logger.log({
        level: "error",
        message: "Error while fetching post with request"
      })
    );

    return request ? Buffer.from(request, "binary") : coverImage;
  }

  /* After posting update the queue and db */
  async _postUpload() {
    this.queue.shift();
    await this.db.set("post_queue", this.queue);

    this.client.logger.log({
      level: "info",
      message: "Cache and db updated"
    });
  }
}

module.exports = PostManager;
