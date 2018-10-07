const { Order, Op } = require('./db');

const Binance = require('./binance')

class OrderTaker {

  constructor() {
    this.binance = Binance;
  }

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

    try {
      let orderResult = await this.binance.buy(order.buyBase, order.buyQuote, order.buySize);
      let price = await this.binance.getPrice(order.buyBase, order.buyQuote);
      let dbResult = await order.update({
        buyTime: new Date(),
        buyId: `${orderResult.orderId}`,
        buyPrice: `${price}`,
        buyOrigQty: orderResult.origQty,
        buyExecQty: orderResult.executedQty,
        buyType: orderResult.type,
        buyRemainingBalance: orderResult.remainingBalance
      });
      return dbResult;
    } catch(errs) {
      throw(errs);
    }
  }

  async executeSellOrder(id) {
    let order = await Order.findOne({ where: { id: id } });

    if (!order.buyTime || order.sellTime) {
      return false;
    }

    try {
      let orderResult = await this.binance.sell(order.buyBase, order.buyQuote, order.buyExecQty);
      let dbResult = await order.update({
        sellTime: new Date(),
        sellId: `${orderResult.orderId}`,
        sellPrice: orderResult.price,
        sellOrigQty: orderResult.origQty,
        sellExecQty: orderResult.executedQty,
        sellType: orderResult.type,
        sellRemainingBalance: orderResult.remainingBalance
      });
      return dbResult;
    } catch (errs) {
      throw errs;
    }
  }

  async getPrice(base, quote) {
    return this.binance.getPrice(base.toUpperCase(), quote.toUpperCase());
  }

  async tradeSummary(id) {
    try {
      let order = await Order.findOne({ 
        where: {
          [Op.or]: [{ buyId: id }, { sellId: id }]
        } 
      });

      let pair = `${order.buyBase}${order.buyQuote}`
      let buyTrades = await this.binance.getTradeData(pair, order.buyId)
      let sellTrades = await this.binance.getTradeData(pair, order.sellId)
      
      let buyQuote = 0;
      let buyFee = 0;
      for (let trade of buyTrades) {
        buyQuote += (parseFloat(trade.price) * parseFloat(trade.qty));
        buyFee += parseFloat(trade.commission);
      }

      let sellQuote = 0;
      let sellFee = 0;
      for (let trade of sellTrades) {
        sellQuote += (parseFloat(trade.price) * parseFloat(trade.qty));
        sellFee += parseFloat(trade.commission);
      }

      let grossProfit = sellQuote - buyQuote;
      let netProfit = grossProfit - (buyFee + sellFee);
      let totals = { buyQuote, sellQuote, buyFee, sellFee, grossProfit, netProfit }

      return { buyTrades, sellTrades, totals }

    } catch(errs) {
      throw errs;
    }

  }
}

module.exports = { OrderTaker }