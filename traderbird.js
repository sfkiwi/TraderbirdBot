const { logger } = require('./logger');
const { Channel, Account, Filter } = require('./db');
const { TwitterStream } = require('./twitter');
const { OrderTaker } = require('./orders');
const EventEmitter = require('events');
const { SendError } = require('./telegram');

class TraderBirdBot extends EventEmitter {
  constructor(chanid) {
    super();
    this.chanid = chanid;
    this.filtermap = {}
    this.namemap = {}
    this.orders = new OrderTaker();
    this.updates = {};

    setInterval(() => {
      for (let id in this.updates) {
        this.orders.getPrice(this.updates[id].base, this.updates[id].quote)
          .then((price) => {
            this.emit('tweet', {
              text: `${this.updates[id].base}${this.updates[id].quote} @ ${price}`
            });
          })
          .catch(err => {
            logger.error(`TraderBird.updates: ${err.message}`);
            SendError(err.message);
          });
      }
    }, 60000)
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
    } catch(errs) {
      if (!(errs instanceof Array)) {
        errs = [err]
      }
      for (let err of errs) {
        logger.error(`TraderBird.loadData: ${err.message}`);
        SendError(err);
      }
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
    } catch(errs) {
      if (!(errs instanceof Array)) {
        errs = [errs]
      }
      for (let err of errs) {
        if (err.code === 17) {
          res(`Can't find a twitter account with the username '${username}'`)
        }
        logger.error(`TraderBird.addUser: ${err.message}`);
        SendError(err);
      }
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
    } catch (errs) {
      if (!(errs instanceof Array)) {
        errs = [errs]
      }
      for (let err of errs)  {
        logger.error(`TraderBird.addUser: ${err.message}`);
        SendError(err);
      }
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

  async getPrice(symbol, res) {
    try {
      let price = await this.orders.getPrice(symbol, this.channel.buyQuote);
      res(`${symbol}${this.channel.buyQuote}: ${price}`);
    } catch(err) {
      res(`Unknown trading pair ${symbol}${this.channel.buyQuote}`)
    }
  }

  async placeBuyOrder(id, res) {
    try {
      let result = await this.orders.executeBuyOrder(id);

      if (!result) {
        res('This order has already been executed')
        return;
      }

      let button = [{
        text: `sell ${result.buyExecQty} ${result.buyBase}/${result.buyQuote} (${result.buyId})`,
        callback_data: 'sell' + result.id
      }]

      this.emit('tweet', {
        text: `${result.buyType} Buy Order Placed for ${result.buyExecQty} ${result.buyBase}/${result.buyQuote} \n` + 
          `Current Market Price: ${result.buyPrice}\n` +
          `Order id: ${result.buyId}\n` +
          `Remaining Balance: ${result.buyRemainingBalance} ${result.buyQuote}`,
        inline_keyboard: [button]
      });

      this.updates[result.buyId] = { base: result.buyBase, quote: result.buyQuote }

    } catch(errs) {
      if (!(errs instanceof Array)) {
        errs = [errs]
      }
      for (let err of errs) {
        logger.error(`Orders.executeBuyOrder: ${err.message}`);
        SendError(err.message);
        res(`Unable to place buy order: ${err.message}`);
      }
    }
  }

  addUpdate(symbol, res) {

    let sym = symbol.toUpperCase()
    let quote = this.channel.buyQuote.toUpperCase();
    let pair = `${sym}${quote}`;

    for (let id in this.updates) {
      if (this.updates[id].base.toUpperCase() === sym) {
        if (this.updates[id].quote.toUpperCase() === quote) {
          res(`Already tracking ${symbol}${this.channel.buyQuote}`)
          return;
        }
      }
    }

    if (this.updates[pair]) {
      res(`Already tracking ${symbol}${this.channel.buyQuote}`)
      return;
    }

    this.updates[pair] = { base: sym, quote: quote }
    res(`I'm now tracking ${symbol}${this.channel.buyQuote}`)
  }

  removeUpdate(symbol, res) {
    let sym = symbol.toUpperCase();
    let quote = this.channel.buyQuote.toUpperCase();
    let pair = `${sym}${quote}`;

    for (let id in this.updates) {
      if (this.updates[id].base.toUpperCase() === sym) {
        if (this.updates[id].quote.toUpperCase() === quote) {
          res(`Stopped Tracking ${symbol}${this.updates[id].quote}`)
          delete this.updates[id];
          return;
        }
      }
    }

    if (this.update[pair]) {
      res(`Stopped Tracking ${symbol}${this.updates[sym].quote}`)
      delete this.updates[pair]
      return;
    }

    res(`I'm not currently tracking ${symbol}${this.channel.buyQuote}`)
  }

  stopUpdates(res) {
    this.updates = {};
    res('I have stopped Tracking all Symbols')
  }

  async placeSellOrder(id, res) {
    try {
      let result = await this.orders.executeSellOrder(id);

      if (!result) {
        res('This order has already been executed')
        return;
      }

      delete this.updates[result.buyId];

      res(`${result.buyType} Sell Order Placed for ${result.buyExecQty} ${result.buyBase}/${result.buyQuote} \n` +
          `Order id: ${result.sellId}\n` +
          `Remaining Balance: ${result.sellRemainingBalance} ${result.buyQuote}`);

      let summary = await this.orders.tradeSummary(result.buyId);
      let grossPct = summary.totals.grossProfit / (summary.totals.buyQuote + summary.totals.buyFee);
      let netPct = summary.totals.netProfit / (summary.totals.buyQuote + summary.totals.buyFee);
      let bought = summary.buyTrades.reduce((prev, trade) => {
        return `Bought ${trade.qty} ${result.buyBase} @ ${trade.price} ${result.buyQuote}/${result.buyBase}\n`  
      }, '');
      let sold = summary.sellTrades.reduce((prev, trade) => {
        return `Sold ${trade.qty} ${result.buyBase} @ ${trade.price} ${result.buyQuote}/${result.buyBase}\n`
      }, '');

      res(bought + sold + 
        `Entry Fee: ${summary.totals.buyFee} BTC\n` + 
        `Exit Fee: ${summary.totals.sellFee} BTC\n` + 
        `Gross Profit: ${summary.totals.grossProfit} BTC (${grossPct})\n` + 
        `Net Profit: ${summary.totals.netProfit} BTC (${netPct})\n`);

    } catch (errs) {
      if (!(errs instanceof Array)) {
        errs = [errs]
      }
      for (let err of errs) {
        logger.error(`Orders.executeSellOrder: ${err.message}`);
        SendError(err.message);
        res(`Unable to place sell order: ${err.message}`);
      }
    }
  }
}

module.exports = { TraderBirdBot }