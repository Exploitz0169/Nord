const _ = require("lodash");

class Inbox {
  constructor() {
    this.name = "inbox";
    this.lastResult = {};
  }

  async handle(client, data) {
    /* Fetch inbox */
    const inboxFeed = client.ig.feed.directInbox();
    const threads = await inboxFeed.items();

    /* Update thread cache on first go */
    if (!this.lastResult[data.name])
      return (this.lastResult[data.name] = threads);

    /* Temp array holding all new messages */
    const _temp = [];

    /* Iterate each thread to check new messages */
    for (const thread of threads) {
      /* Get the thread in thread cache */
      const oldThread = this.lastResult[data.name].find(
        _thread => _thread.thread_id === thread.thread_id
      );
      if (!oldThread) return;

      /* Filter new objects. Returns objects it can not find in cache (new objects)*/
      let filtered;
      if (client.whitelist.length) {
        filtered = thread.items.filter(
          item =>
            !oldThread.items.find(i => i.item_id === item.item_id) &&
            client.whitelist.includes(item.user_id)
        );
      } else {
        filtered = thread.items.filter(
          item => !oldThread.items.find(i => i.item_id === item.item_id)
        );
      }

      if (filtered.length) {
        _temp.push(filtered);
      }
    }

    /* If there is at least one new message emit */
    _temp.length ? client.emit("inbox", _temp) : null;
    /* Update thread cache */
    this.lastResult[data.name] = threads;
  }
}

module.exports = Inbox;
