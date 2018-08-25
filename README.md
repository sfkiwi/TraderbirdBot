# TraderbirdBot
Simple Telegram bot that follows twitter accounts and looks for tweets containing specific search terms

## Installation

1. git clone this repository to a local folder
2. inside the cloned repo, type `yarn` to install dependencies
3. Create a new telegram bot token via the Telegram Botfather. You will also need to set up the commands shown at the bottom of this readme.
4. Create a Twitter Dev account and new Twitter app to obtain your keys and tokens
5. create a `.env` file in the root folder or export the following env vars

````
  TELEGRAM_TOKEN=<Telegram bot token>
  TWITTER_KEY=<Twitter consumer api key>
  TWITTER_SECRET=<Twitter consumer secret>
  TWITTER_TOKEN_ACCESS=<Twitter access token>
  TWITTER_TOKEN_SECRET=<Twitter token secret>
````

6. Type `yarn run start` to start the bot

## Usage

After creating your Telegram bot via the Telegram Botfather you should now be able 
to see your bot in the telegram app. If you send a message to the bot you should see
the message printed out by the running bot. Inside that message you will see the chatid.

The bot should automatically grab this chatid and should now be working. If not, make sure 
that the chatid has been set correctly inside the code.

You can add the bot to a group via the telegram app. Note that the bot only supports broadcasting
tweets to one channel at a time. 

The bot will continuosly look for new tweets from the accounts being followed and if those new 
tweets contain any of the filter keywords it will send the tweet to the telgram channel based
on the current chatid.

## Commands

You will need to set up the following commands through the botfather for your telegram bot.

`/add` - Add a new twitter account
`/remove` - Remove a twitter account
`/following` - Show which accounts are being followed 
`/addfilter` - Add a filter keyword to the list of filter keywords
`/removefilter` - Remove a filter from the list
`/filters` - Show all filters

## Docker

You can also run `docker build -t <imagename> .` to build a docker container.