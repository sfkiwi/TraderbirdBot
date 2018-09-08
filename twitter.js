var Twitter = require('twitter');
const { promisify } = require('util');
const getBearerToken = promisify(require('get-twitter-bearer-token'))
const { logger } = require('./logger');

const BACKOFF_TIMEOUT = 60000;

class TwitterStream {
  constructor(userids, onTweet, onError, id) {
    this.userids = new Set(userids);
    this.onTweet = onTweet;
    this.onError = onError || this.handleStreamError.bind(this);
    this.backoff = BACKOFF_TIMEOUT;
    this.id = id;

    this.client = new Twitter({
      consumer_key: process.env.TWITTER_KEY,
      consumer_secret: process.env.TWITTER_SECRET,
      access_token_key: process.env.TWITTER_TOKEN_ACCESS,
      access_token_secret: process.env.TWITTER_TOKEN_SECRET
    });

    if (this.userids.size > 0) {
      this.stream = this.getStream(this.userids, onTweet, this.onError);
    }
  }

  getStream(userids, onTweet, onError) {

    let ids = [...userids].join(',');
    let stream = this.client.stream('statuses/filter', { follow: ids });
    stream.on('data', onTweet);
    stream.on('error', onError);
    stream.on('end', this.handleStreamEnd.bind(this));
    stream.on('response', this.handleStreamConnect.bind(this));

    return stream;
  }

  handleStreamEnd(response) {
    logger.info(`[${this.id}] Stream Ended [Status Code: ${response.statusCode}]`);
  }

  restartStream(delay = this.backoff) {
    this.stopStream();
    setTimeout(() => {
      logger.info(`[${this.id}] Restarting Stream after ${this.backoff/1000} seconds`)
      this.stream = this.getStream(this.userids, this.onTweet, this.onError);
    }, this.backoff)
  }

  handleStreamError(error, ...rest) {
    if (error.message === 'Status Code: 420') {
      this.restartStream(this.backoff);
      this.backoff *= 2;
      this.attempts++;
    }
    logger.error(`[${this.id}] Stream Error: ${error.message}`);
  }

  handleStreamConnect(response) {
    logger.info(`[${this.id}] Stream Response [Status Code: ${response.statusCode}]`);
    if (response.statusCode === 200) {
      this.backoff = BACKOFF_TIMEOUT;
      this.attempts = 0;
    }
  }

  stopStream() {
    this.stream.destroy()
  }

  addUserId(userid) {
    if (this.userids.add(userid)) {
      this.restartStream();
    }
  }

  removeUserId(userid) {
    if (this.userids.delete(userid)) {
      this.stopStream();

      if (this.userids.size > 0) {
        this.restartStream();
      }
    }
  }

  async getUserId(username) {
    return await this.client.get('users/lookup', { screen_name: username });
  }

  onTweet(onTweet) {
    this.onTweet = onTweet;
    this.stream.on('data', onTweet);
  }

  onError(onError) {
    this.onError = onError;
    this.stream.on('error', onError);
  }
}

module.exports = { TwitterStream }