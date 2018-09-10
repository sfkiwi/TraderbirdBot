var Sequelize = require('sequelize')


const dbname = process.env.DB_DBNAME || 'traderbirdbot';
const dbuser = process.env.DB_USERNAME || 'root';
const dbpass = process.env.DB_PASSWORD || null;
const dbhost = process.env.DB_HOSTNAME;


const sequelize = new Sequelize(dbname, dbuser, dbpass, {
  host: dbhost,
  dialect: 'mysql',
  dialectOptions: {
    charset: 'utf8',
    collate: 'utf8_general_ci',
  },
});

const Account = sequelize.define('account', {
  username: Sequelize.STRING,
  userid: Sequelize.STRING
});

const Filter = sequelize.define('filter', {
  keyword: Sequelize.STRING
});

const Channel = sequelize.define('channel', {
  chatid: {
    type: Sequelize.STRING,
  },
  buySize: {
    type: Sequelize.FLOAT,
    defaultValue: 1.0
  },
  buyQuote: {
    type: Sequelize.STRING,
    defaultValue: 'BTC'
  }
});

const Order = sequelize.define('order', {
  buySize: Sequelize.FLOAT,
  buyQuote: Sequelize.STRING,
  buyBase: Sequelize.STRING,
  buyTime: Sequelize.DATE,
  sellSize: Sequelize.FLOAT,
  sellQuote: Sequelize.STRING,
  sellBase: Sequelize.STRING,
  sellTime: Sequelize.DATE
})

const Tweet = sequelize.define('tweet', {
  text: Sequelize.TEXT,
  isQuote: Sequelize.BOOLEAN,
  isReply: Sequelize.BOOLEAN,
  isRetweet: Sequelize.BOOLEAN,
  userid: Sequelize.TEXT,
  timestamp_ms: Sequelize.STRING,
},
{ 
  charset: 'utf8', 
  collate: 'utf8_unicode_ci' 
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
Order.belongsTo(Tweet);
Order.belongsTo(Channel);

async function sync() {
  return await sequelize.sync();
}

module.exports = { Channel, Tweet, Filter, Account, Order, sync };