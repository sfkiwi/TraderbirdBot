// SendError is used inside all of the required modules
// TODO: This should be fixed
exports.SendError = SendError = function (error) {

  let options = {
    body: {
      text: error,
      chat_id: '382232505',
    },
    json: true
  }

  request.post(url + sendMessageCmd, options);
}

const { TraderBirdBot } = require('./traderbird');
const { Channel } = require('./db');
const { logger } = require('./logger');
const EventEmitter = require('events'); 
const _ = require('underscore');

const request = require('request-promise-native');

const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/`;
const sendMessageCmd = 'sendMessage';
const getUpdatesCmd = 'getUpdates';

let channelMap = {};



class TelegramBot extends EventEmitter {
  constructor(chatid) {
    super();

    this.timeout = 0;
    this.chatid = chatid || process.env.TELEGRAM_CHATID;
    this.tbb = new TraderBirdBot(this.chatid);
    this.tbb.loadData();
    this.tbb.on('tweet', this.broadcastMessage.bind(this));

    this.on('add', this.tbb.addAccount.bind(this.tbb));
    this.on('remove', this.tbb.removeAccount.bind(this.tbb));
    this.on('addfilter', this.tbb.addFilter.bind(this.tbb));
    this.on('removefilter', this.tbb.removeFilter.bind(this.tbb));
    this.on('following', this.tbb.getAccounts.bind(this.tbb));
    this.on('filters', this.tbb.getFilters.bind(this.tbb));
    this.on('size', this.tbb.setSize.bind(this.tbb));
    this.on('quote', this.tbb.setQuote.bind(this.tbb));
    this.on('buy', this.tbb.placeBuyOrder.bind(this.tbb));
    this.on('sell', this.tbb.placeSellOrder.bind(this.tbb));
    this.on('price', this.tbb.getPrice.bind(this.tbb));
  }

  broadcastMessage(message) {
    let text = message.text;
    let keyboard = message.inline_keyboard;
    let options = { body: { parse_mode: 'HTML' }};

    if (keyboard) {
      options.body.reply_markup = {
        inline_keyboard: keyboard
      }
    }
    this.sendMessage(text, options);
  }

  processCommand(command, data) {
    this.emit(command, data, this.sendMessage.bind(this));
  }

  sendMessage(text, options={}) {

    if (!options.body) {
      options.body = {}
    }

    options.body.text = text;
    options.body.chat_id = this.chatid;
    options.json = true;

    request.post(url + sendMessageCmd, options);
  }
}



Channel.findAll({ attributes: ['chatid']})
  .then((channels) => {
    if (channels.length) {
      channels.forEach((channel) => (channelMap[channel.chatid] = new TelegramBot(channel.chatid)))
    } else {
      let bot = new TelegramBot();
      channels[bot.chatid] = bot
    }
  });


let offset = 0;

async function getUpdates() {

  const options = {
    body: {
      offset: offset,
      timeout: 10,
    },
    json: true
  }

  try {

    let { result } = await request.post(url + getUpdatesCmd, options)

    if (result.length) {
      result.forEach((item) => {

        if (item.callback_query) {
          let cb = item.callback_query.data;
          let match = /(buy|sell)(.*)/.exec(cb);

          if (!match) {
            return;
          }

          let [res, cmd, data] = match;

          let chatid = item.callback_query.message.chat.id;
          channelMap[chatid].processCommand(cmd, data);
        }
        if (!item.message) {
          return
        }

        let chatid = item.message.chat.id;
        if (!channelMap[chatid]) {
          channelMap[chatid] = new TelegramBot(chatid)
          Channel.findOrCreate({ chatid: chatid, defaults: { chatid: chatid }})
        }
        
        let match = /\/(addfilter|add|removefilter|following|remove|filters|size|quote|price)\s*@*(.*)/.exec(item.message.text);
        
        if (!match) {
          return;
        }

        let [res, cmd, data] = match;

        let i = data.indexOf('@TraderbirdBot');

        if (i >= 0) {
          data = data.slice(0, i) + data.slice(i + '@TraderbirdBot '.length, data.length);
        }

        channelMap[chatid].processCommand(cmd, data);
      });
      offset = result[result.length - 1].update_id + 1;
    }
  } catch(errs) {
    if (!(errs instanceof Array)) {
      errs = [errs]
    }
    for (let err of errs) {
      if (err.message.includes('Bad Gateway') || err.message.includes('Timed out')) {
        logger.error(`Telegram Network Error: ${err.message}`);
        SendError(`Telegram Network Error: ${err.message}`)
        this.timeout = 1000;
      } else if (err.message.includes('Unauthorized')) {
        logger.error(`Telegram Authorization Error: ${err.message}`);
        SendError(`Telegram Authorization Error: ${err.message}`)
      } else {
        logger.error(`Unknown Telegram Error: ${err.message}`);
        SendError(`Unknown Telegram Error: ${err.message}`)
      }
    }
  } finally {
    setTimeout(() => {
      this.timeout = 0;
      getUpdates();
    }, this.timeout);  }
}

getUpdates();