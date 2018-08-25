const request = require('request-promise-native');
const dotenv = require('dotenv');
const express = require('express');
const morgan = require('morgan');
const crypto = require('crypto')
var Twitter = require('twitter');
const getBearerToken = require('get-twitter-bearer-token')
const BigNumber = require('bignumber.js')

dotenv.config();

const token = process.env.TELEGRAM_TOKEN;

const url = `https://api.telegram.org/bot${token}/`;
const sendMessage = 'sendMessage';
const getUpdates = 'getUpdates';

let sendOptions = {
  body: {
    chat_id: '382232505',
    text: 'Hello',
  },
  json: true,
};

let names = ['coinbase', 'facebook', 'robinhood', 'ibmblockchain']
let ids = [undefined, undefined, undefined, undefined]
let n = 0;

let filters = ['XLM','BNB','XRP','ETC','EOS','ADA','BAT','ZEC','ZRX']

const twitter_consumer_key = process.env.TWITTER_KEY
const twitter_consumer_secret = process.env.TWITTER_SECRET

getBearerToken(twitter_consumer_key, twitter_consumer_secret, (err, res) => {
  if (err) {
    console.log('Bearer Error',err)
    // handle error
  } else {

    // bearer token
    console.log('Response',res.body.access_token)

    var client = new Twitter({
      consumer_key: process.env.TWITTER_KEY,
      consumer_secret: process.env.TWITTER_SECRET,
      bearer_token: res.body.access_token
    });

    setInterval(() => {
      n = (n + 1) % names.length;
      var params = { screen_name: names[n]}
      if (ids[n]) {
        params.since_id = ids[n] 
      } else {
        params.count = 1
      }
      console.log(`Retreiving new tweets from ${names[n]} after id ${ids[n]}`);
      client.get('statuses/user_timeline', params, function (error, tweets, response) {
        if (error) {
          console.log('Client Error', error)
        }
        if (!error) {
          if (tweets.length > 0) {
            ids[n] = new BigNumber(tweets[0].id_str).plus(1).toFixed();
            console.log(`Received ${tweets.length} new tweets from ${names[n]}`)
            tweets.forEach((tweet) => {
              let found = [];
              filters.forEach(filter => {
                let i = tweet.text.indexOf(filter)
                if (i >= 0) {
                  console.log(tweet.text)
                  console.log(tweet.text.slice(0, i))
                  console.log(tweet.text.slice(i, i + filter.length))
                  console.log(tweet.text.slice(i + filter.length, tweet.text.length))
                  tweet.text = tweet.text.slice(0, i) + '<b>' +
                  tweet.text.slice(i, i + filter.length) + '</b>' +
                  tweet.text.slice(i + filter.length, tweet.text.length);
                  console.log(tweet.text);
                  found.push(filter);
                }
              })
              if (found.length > 0 || filters.length === 0) {  
                let text = tweet.text
                let name = tweet.user.name
                sendOptions.body.text = `@${name} - ${text}`;
                sendOptions.body.parse_mode = 'HTML';
                request.post(url + sendMessage, sendOptions);
              }
            })
          }
        }
      });
    }, 1000)
  }
})

// Handle Telegram Bot longpolling
let offset = 0;

function longpoll() {
  const options = {
    body: {
      offset: offset,
      timeout: 10,
    },
    json: true
  }
  request.post(url + getUpdates, options)
    .then((response) => {
      console.log(response);
      let data = response.result;
      if (data.length) {
        data.forEach((item) => {
          if (item.message.chat.id !== sendOptions.body.chat_id) {
            sendOptions.body.chat_id = item.message.chat.id;
          }
          console.log(item.message.text);
          let result = /\/(addfilter|add|removefilter|following|remove|filters)\s*@*(.*)/.exec(item.message.text);
          if (!result) {
            return;
          }
          let [res, cmd, data] = result;

          let i = data.indexOf('@TraderbirdBot');
          if (i >= 0) {
            data = data.slice(0, i) + data.slice(i + '@TraderbirdBot '.length, data.length);
          }

          if (cmd === 'following') {
            sendOptions.body.text = names.reduce((prev, name) => {
              return prev.concat('@', name,'\n');
            },'');
            if (sendOptions.body.text.length === 0) {
              sendOptions.body.text = 'Not following anyone. Try /add <twitterAccount>';
            }
            request.post(url + sendMessage, sendOptions);
          }
          if (cmd === 'add') {
            if (data && data.length > 0) {
              console.log(`Adding ${data}`);
              let i = names.findIndex((element) => {
                return element === data
              })
              if (i >= 0) {
                sendOptions.body.text = `Looks like I'm already following ${data}`;
                request.post(url + sendMessage, sendOptions);  
              } else {
                names.push(data);
                ids.push(undefined);
                sendOptions.body.text = `Adding ${data}`;
                request.post(url + sendMessage, sendOptions);
              }
            } else {
              sendOptions.body.text = `Did you add the @ before the username? Try /add @bitcoin for example`;
              request.post(url + sendMessage, sendOptions);
            }
          }
          if (cmd === 'remove') {
            if (data && data.length > 0) {
              let i = names.findIndex((element) => {
                return element === data
              })
              
              if (i >= 0) {
                console.log(`Removing ${data}`);
                names.splice(i, 1)
                ids.splice(i, 1);
                sendOptions.body.text = `Removing ${data}`;
                request.post(url + sendMessage, sendOptions);
              } else {
                sendOptions.body.text = `Sorry I couldn't find ${data}, Try /following to see which accounts I'm following`;
                request.post(url + sendMessage, sendOptions);                
              }
            } else {
              sendOptions.body.text = `Did you add the @ before the username? Try /remove @facebook for example`;
              request.post(url + sendMessage, sendOptions);
            }
          }
          if (cmd === 'addfilter') {
            if (data && data.length > 0) {
              console.log(`Adding ${data}`);
              let i = filters.findIndex((element) => {
                return element === data
              })
              if (i >= 0) {
                sendOptions.body.text = `Looks like I already have ${data}`;
                request.post(url + sendMessage, sendOptions);
              } else {
                filters.push(data);
                sendOptions.body.text = `Adding ${data}`;
                request.post(url + sendMessage, sendOptions);
              }
            } else {
              sendOptions.body.text = `Did you add the search term? Try /addfilter BTC for example`;
              request.post(url + sendMessage, sendOptions);
            }
          }
          if (cmd === 'removefilter') {
            if (data && data.length > 0) {
              let i = filters.findIndex((element) => {
                return element === data
              })

              if (i >= 0) {
                console.log(`Removing ${data}`);
                filters.splice(i, 1)
                sendOptions.body.text = `Removing ${data}`;
                request.post(url + sendMessage, sendOptions);
              } else {
                sendOptions.body.text = `I couldn't find ${data}, Try /filters to see which terms I'm searching for`;
                request.post(url + sendMessage, sendOptions);
              }
            } else {
              sendOptions.body.text = `Did you add the search term? Try /removefilter ETH for example`;
              request.post(url + sendMessage, sendOptions);
            }
          }
          if (cmd === 'filters') {
            sendOptions.body.text = filters.reduce((prev, filter) => {
              return prev.concat(filter, '\n');
            }, '');
            if (sendOptions.body.text.length === 0) {
              sendOptions.body.text = 'No Filters'
            }
            request.post(url + sendMessage, sendOptions);
          }
        });
        offset = data[data.length-1].update_id + 1;
      }
      setImmediate(() => {
        longpoll();
      });
    })
    .catch(err => console.log('Error:', err));
}

longpoll();