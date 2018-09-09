const { logger } = require('./logger');
const { Channel, Account, Filter } = require('./db');
const { TwitterStream } = require('./twitter');
const EventEmitter = require('events');

class TraderBirdBot extends EventEmitter {
  constructor(chanid) {
    super();
    this.chanid = chanid;
    this.filtermap = {}
    this.namemap = {}
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

  tweetHandler(event) {

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
      logger.log('info', `TWEET by ${screen_name} [${elapsed}|${elapsed2}]: ${tweet}`);
      let [text, found] = this.parseTweet(tweet)

      if (found.length > 0 || filters.length === 0) {
        this.namemap[screen_name].createTweet({
          text: tweet,
          isQuote: false,
          isReply: !!reply,
          isRetweet: !!retweet,
          userid: userid,
          timestamp_ms: event.timestamp_ms
        });

        let buttons = found.map((keyword, index) => ([{
          text: `buy ${this.channel.buySize*100}% ${keyword}/${this.channel.buyBase}`,
          callback_data: index
        }]))
        this.emit('tweet', {
          text: `@${screen_name} - ${text}`,
          inline_keyboard: buttons
        });
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
    Object.keys(this.filtermap).forEach(async (filter) => {
      let i = text.indexOf(filter)
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
      let [account] = await Account.findOrCreate({ where: { username: username }, defaults: { username: username, userid: id.id_str }})
      await this.channel.addAccount(account)
      this.namemap[username] = account; 
      this.twitter.addUserId(id.id_str);
      res(`Adding ${username}`);
    } catch([err]) {
      if (err.code === 17) {
        res(`Can't find a twitter account with the username '${username}'`)
      }
      logger.error('TraderBird.addUser', err);
    }
  }

  addAccount(username, res) {
    if (username) {

      logger.info(`Adding ${username}`);

      if (this.namemap[username]) {
        res(`Looks like I'm already following ${username}`);
        return;
      }

      this._addAccount(username, res);
    } else {
      res(`Did you add the @ before the username? Try /add @bitcoin for example`);
    }
  }

  removeAccount(username, res) {
    if (username) {
      
      if (this.namemap[username]) {
        let account = this.namemap[username];
        this.twitter.removeUserId(account.userid);
        this.channel.removeAccount(account);
        delete this.namemap[username]
        res(`Removing ${username}`);
      } else {
        res(`Sorry I couldn't find ${username}, Try /following to see which accounts I'm following`);
      }        
    } else {
      res(`Did you add the @ before the username? Try /remove @facebook for example`);
    }
  }

  async _addFilter(keyword, res) {
    try {
      let [filter] = await Filter.findOrCreate({ where: { keyword: keyword }, defaults: { keyword: keyword } })
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

      if (this.filtermap[keyword]) {
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

      if (this.filtermap[keyword]) {
        let filter = this.filtermap[keyword];
        this.channel.removeFilter(filter);
        delete this.filtermap[keyword]
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

  setBase(base, res) {
    if (base && typeof base === 'string') {
      switch(base.toUpperCase()) {
        case 'BTC':
        case 'ETH':
        case 'BNB':
        case 'USDT':
          this.channel.update({buyBase: base})
          res(`Updated base currency pair to ${base}`);   
          break;
        default:
          res(`Sorry ${base} is not supported`);   
          break;    
      }

    } else {
      res(`Specify which base currency to use from either BTC, ETH, BNB or USDT`);
    }
  }
}

module.exports = { TraderBirdBot }