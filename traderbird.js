const { logger } = require('./logger');
const { Channel, Account, Filter } = require('./db');
const { TwitterStream } = require('./twitter');
const { OrderTaker } = require('./orders');
const EventEmitter = require('events');

class TraderBirdBot extends EventEmitter {
  constructor(chanid) {
    super();
    this.chanid = chanid;
    this.filtermap = {}
    this.namemap = {}
    this.orders = new OrderTaker();
  }

  async loadData() {
    try {
      [this.channel] = await Channel.findOrCreate({ where: { chatid: this.chanid }, defaults: { chatid: this.chanid }})
      let accounts = await this.channel.getAccounts()
      accounts.forEach(account => {
        this.namemap[account.username] = account
      });

      let filters = await this.channel.getFilters();
      filters.forEach(filter => {
        this.filtermap[filter.keyword] = filter
      });

      let userids = accounts.map(account => account.userid);
      this.twitter = new TwitterStream(userids, this.tweetHandler.bind(this), null, this.chanid);
    } catch(err) {
      logger.error('TraderBird.loadData', err);
    }
  }

 async tweetHandler(event) {

    if (!event) {
      logger.info('Event was null');
      return;
    }

    let userid = event.user.id_str;
    let screen_name = event.user.screen_name;
    let reply = event.in_reply_to_screen_name;
    let retweet = event.retweeted_status;
    let tweet = event.text;

    let time = Date.now();
    let date = new Date(event.created_at)
    let eventtime = parseInt(event.timestamp_ms);
    let createdtime = date.getTime();
    let elapsed = (time - eventtime) / 1000;
    let elapsed2 = (time - createdtime) / 1000;

    if (this.namemap[screen_name]) {
      if (reply) {
        logger.log('info', `REPLY by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`);
      } else if (retweet) {
        logger.log('info', `RETWEET by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`);
      } else {
        logger.log('info', `TWEET by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`);
      }

      let [text, found] = this.parseTweet(tweet)

      if (found.length > 0 || Object.keys(this.filtermap).length === 0) {
        let t = await this.namemap[screen_name].createTweet({
          text: tweet,
          isQuote: null,
          isReply: !!reply,
          isRetweet: !!retweet,
          userid: userid,
          timestamp_ms: event.timestamp_ms
        });

        let orders = found.map((keyword, index) => ({
          buyBase: keyword,
          buyQuote: this.channel.buyQuote,
          buySize: this.channel.buySize
        }));

        let ids = await Promise.all(orders.map(order => this.orders.saveOrder(t, this.channel, order)));

        let buttons = ids.map((id, i) => (
          [{
            text: `buy ${this.channel.buySize*100}% ${found[i]}/${this.channel.buyQuote}`,
            callback_data: 'buy' + id
          }]
        ));

        let tweetType = reply ? 'REPLY' : (retweet ? 'RETWEET' : 'TWEET');
        this.emit('tweet', {
          text: `${tweetType} @${screen_name} - ${text}`,
          inline_keyboard: buttons
        });


        t.save();
      }
      return
    }

    if (reply) {
      logger.log('info', `REPLY to ${event.in_reply_to_screen_name} by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`);
      return;
    }

    if (retweet) {
      logger.log('info', `RETWEET of ${event.retweeted_status.user.screen_name} by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`)
      return
    }
  }

  parseTweet(text) {

    let found = [];
    let textUpper = text.toUpperCase();
    Object.keys(this.filtermap).forEach(async (filter) => {
      let i = textUpper.indexOf(filter)
      if (i >= 0) {
        text = text.slice(0, i) + '<b>' +
          text.slice(i, i + filter.length) + '</b>' +
          text.slice(i + filter.length, text.length);
        found.push(filter);
      }
    })

    return [text, found]
  }

  async _addAccount(username, res) {
    try {
      let [id] = await this.twitter.getUserId(username);

      if (this.namemap[id.screen_name]) {
        res(`Looks like I'm already following ${username}`);
        return;
      }

      let [account] = await Account.findOrCreate({ where: { username: id.screen_name }, defaults: { username: id.screen_name, userid: id.id_str }})
      await this.channel.addAccount(account)
      this.namemap[id.screen_name] = account; 
      this.twitter.addUserId(id.id_str);
      res(`Adding ${id.screen_name}`);
    } catch([err]) {
      if (err.code === 17) {
        res(`Can't find a twitter account with the username '${id.screen_name}'`)
      }
      logger.error('TraderBird.addUser', err);
    }
  }

  addAccount(username, res) {
    if (username) {

      logger.info(`Adding ${username}`);

      this._addAccount(username, res);
    } else {
      res(`Did you add the @ before the username? Try /add @bitcoin for example`);
    }
  }

  getScreenName(username) {
    let names = Object.keys(this.namemap);
    for (let name of names) {
      if (username.toLowerCase() === name.toLowerCase()) {
        return name;
      }
    }
  }

  removeAccount(username, res) {
    if (username) {
      let screenName = this.getScreenName(username);
      if (screenName) {
        let account = this.namemap[screenName];
        this.twitter.removeUserId(account.userid);
        this.channel.removeAccount(account);
        delete this.namemap[screenName]
        res(`Removing ${screenName}`);
      } else {
        res(`Sorry I couldn't find ${screenName}, Try /following to see which accounts I'm following`);
      }        
    } else {
      res(`Did you add the username? Try /remove facebook for example`);
    }
  }

  async _addFilter(keyword, res) {
    try {
      let key = keyword.toUpperCase();
      let [filter] = await Filter.findOrCreate({ where: { keyword: key }, defaults: { keyword: key } })
      await this.channel.addFilter(filter)
      this.filtermap[filter.keyword] = filter;
      res(`Adding ${keyword}`);
    } catch ([err]) {
      logger.error('TraderBird.addUser', err);
    }
  }

  addFilter(keyword, res) {
    if (keyword) {

      logger.info(`Adding Filter '${keyword}'`);

      if (this.filtermap[keyword.toUpperCase()]) {
        res(`Looks like I already have ${keyword}`);
        return;
      }

      this._addFilter(keyword, res);
    } else {
      res(`Did you add the search term? Try /addfilter BTC for example`);
    }
  }

  removeFilter(keyword, res) {
    if (keyword) {

      let key = keyword.toUpperCase()
      if (this.filtermap[key]) {
        let filter = this.filtermap[key];
        this.channel.removeFilter(filter);
        delete this.filtermap[key]
        res(`Removing ${keyword}`);
      } else {
        res(`I couldn't find ${keyword}, Try /filters to see which terms I'm searching for`);
      }
    } else {
      res(`Did you add the search term? Try /removefilter ETH for example`);
    }
  }

  getAccounts(data, res) {
    let text = Object.keys(this.namemap).join('\n');
    if (text.length === 0) {
      text = 'Not following anyone. Try /add <twitterAccount>';
    }
    res(text);
  }

  getFilters(data, res) {
    let text = Object.keys(this.filtermap).join('\n');
    if (text.length === 0) {
      text = 'No Filters'
    }
    res(text)
  }

  setSize(size, res) {
    if (size) {
      const s = size;
      try {
        let sizeFloat = parseFloat(s)
        this.channel.update({buySize: sizeFloat})
        res(`Updated buy size to ${s}`)
      } catch (err) {
        res(`Unable to convert to a number. Try /size 0.1 for 10% of avail bal`);       
      }
    } else {
      res(`Try adding the size. e.g. 0.1 (10% of avail bal)`);
    }
  }

  setQuote(quote, res) {
    if (quote && typeof quote === 'string') {
      switch(quote.toUpperCase()) {
        case 'BTC':
        case 'ETH':
        case 'BNB':
        case 'USDT':
          this.channel.update({buyQuote: quote})
          res(`Updated quote currency pair to ${quote}`);   
          break;
        default:
          res(`Sorry ${quote} is not supported`);   
          break;    
      }

    } else {
      res(`Specify which quote currency to use from either BTC, ETH, BNB or USDT`);
    }
  }

  async placeBuyOrder(id, res) {
    let result = await this.orders.executeBuyOrder(id);
    if (result) {

      let button = [{
        text: `sell ${result.buyBase}/${result.buyQuote}`,
        callback_data: 'sell' + result.id
      }]

      this.emit('tweet', {
        text: `Order Placed for ${result.buyBase}/${result.buyQuote}`,
        inline_keyboard: [button]
      });

    } else {
      res(`Unable to place buy order`);
    }
  }

  async placeSellOrder(id, res) {
    let result = await this.orders.executeSellOrder(id);
    if (result) {
      res(`Order completed for ${result.sellBase}/${result.sellQuote}`)
    } else {
      res(`Unable to place sell order`);
    }
  }
}

module.exports = { TraderBirdBot }