const { Order } = require('./db');

class OrderTaker {

  async saveOrder(tweet, channel, order) {
    let o = await Order.create({
      buyBase: order.buyBase,
      buyQuote: order.buyQuote,
      buySize: order.buySize,
      tweetId: tweet.id,
      channelId: channel.id
    });
    return o.id;
  }

  async executeBuyOrder(id) {
    let order = await Order.findOne({ where: { id: id}});
    
    if (order.buyTime) {
      return false;
    }

    let result = await order.update({buyTime: new Date()})
    return result;
  }

  async executeSellOrder(id) {
    let order = await Order.findOne({ where: { id: id } });

    if (!order.buyTime || order.sellTime) {
      return false;
    }

    let result = await order.update({ 
      sellBase: order.buyBase,
      sellQuote: order.buyQuote,
      sellSize: order.buySize,
      sellTime: new Date() 
    })
    return result;
  }
}

module.exports = { OrderTaker }