var Sequelize = require('sequelize')


const dbname = process.env.DB_DBNAME || 'traderbirdbot';
const dbuser = process.env.DB_USERNAME || 'root';
const dbpass = process.env.DB_PASSWORD || null;
const dbhost = process.env.DB_HOSTNAME;


const sequelize = new Sequelize(dbname, dbuser, dbpass, {
  host: dbhost,
  dialect: 'mysql'
});

const Account = sequelize.define('account', {
  username: Sequelize.STRING,
  userid: Sequelize.STRING
});

const Filter = sequelize.define('filter', {
  keyword: Sequelize.STRING
});

const Channel = sequelize.define('channel', {
  chatid: Sequelize.STRING
});

const Tweet = sequelize.define('tweet', {
  text: Sequelize.TEXT,
  isQuote: Sequelize.BOOLEAN,
  isReply: Sequelize.BOOLEAN,
  isRetweet: Sequelize.BOOLEAN,
  userid: Sequelize.TEXT,
  timestamp_ms: Sequelize.STRING,
});

const ChannelAccount = sequelize.define('channelaccount', {});
const ChannelFilter = sequelize.define('channelfilter', {});

// Channel.hasMany(Account);
Account.hasMany(Tweet);
Tweet.belongsTo(Account);
// Channel.hasMany(Filter);
Account.belongsToMany(Channel, { through: ChannelAccount } );
Channel.belongsToMany(Account, { through: ChannelAccount } );
Filter.belongsToMany(Channel, { through: ChannelFilter } );
Channel.belongsToMany(Filter, { through: ChannelFilter } );

async function sync() {
  return await sequelize.sync();
}

module.exports = { Channel, Tweet, Filter, Account, sync };