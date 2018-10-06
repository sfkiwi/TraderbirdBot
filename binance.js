const binance = require('node-binance-api')().options({
  APIKEY: process.env.BINANCE_APIKEY,
  APISECRET: process.env.BINANCE_APISECRET,
  useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
  test: false // If you want to use sandbox mode where orders are simulated
});

const SymbolInfo = {};

binance.exchangeInfo((err, res) => {
  if (err) {
    console.error(err);
    return;
  }

  for (let symbol of res.symbols) {
    let filters = {}
    symbol.filters.forEach((filter) => {
      filters[filter.filterType] = filter;
    });

    symbol.filters = filters;
    SymbolInfo[symbol.symbol] = symbol;

  }
})

module.exports = {
  getPrice: async function(base, quote) {
    return new Promise((resolve, reject) => {
      binance.prices(`${base}${quote}`, (error, ticker) => {
        if (error) {
          reject(error);
          return
        }
        resolve(ticker[`${base}${quote}`]);
      });
    })
  },
  buy: async function(base, quote, sizeRel) {
    return new Promise((resolve, reject) => {
      binance.balance((err, res) => {
        if (err) {
          reject(err)
          return;
        }
        binance.prices(`${base}${quote}`, (err, ticker) => {
          if (err) {
            reject(err);
            return
          }
          let price = ticker[`${base}${quote}`];
          price = parseFloat(price);
          let pair = `${base}${quote}`;
          let balance = res[quote]
          let balAbs = sizeRel * balance.available;
          let baseSize = balAbs / price;

          if (balance === undefined) {
            reject(new Error(`Unable to retrieve ${quote} balance`))
            return
          }

          if (!balAbs) {
            reject(new Error(`Inufficient ${quote} balance`))
            return
          }

          let minQty, maxQty, stepSize;

          if (SymbolInfo.hasOwnProperty(pair) && 
            SymbolInfo[pair].hasOwnProperty('filters') && 
            SymbolInfo[pair].filters.hasOwnProperty('LOT_SIZE')) {
            minQty = parseFloat(SymbolInfo[pair].filters['LOT_SIZE'].minQty);
            maxQty = parseFloat(SymbolInfo[pair].filters['LOT_SIZE'].maxQty);
            stepSize = parseFloat(SymbolInfo[pair].filters['LOT_SIZE'].stepSize);
          }

          if (stepSize) {
            baseSize = Math.trunc(baseSize / stepSize);
            baseSize = baseSize * stepSize;
          }

          if (minQty && (baseSize < minQty)) {
            reject(new Error(`Minimum order size is ${minQty}`))
            return
          }

          if (maxQty && (baseSize > maxQty)) {
            reject(new Error(`Maximum order size is ${maxQty}`))
            return
          }



          binance.marketBuy(pair, `${baseSize}`, (err, res) => {
            if (err) {
              reject(new Error(err.body));
              return;
            }
            binance.balance((err, bal) => {
              if (err) {
                reject(err)
                return;
              }
              res.remainingBalance = `${bal[quote].available}`;
              resolve(res);  
            });
          });
        });
      })
    })
  },
  sell: async function (base, quote, size) {
    return new Promise((resolve, reject) => {
      binance.balance((err, res) => {
        if (err) {
          reject(err)
          return;
        }
        binance.prices(`${base}${quote}`, (err, ticker) => {
          if (err) {
            reject(err);
            return
          }
          let price = ticker[`${base}${quote}`];
          price = parseFloat(price);
          let pair = `${base}${quote}`;
          let balance = res[base].available;

          if (balance === undefined) {
            reject(new Error(`Unable to retrieve ${base} balance`))
            return
          }

          let baseSize = 0;
          try {
            baseSize = parseFloat(size);
            balance = parseFloat(balance);
          } catch(err) {
            reject(new Error(`Unable to convert ${size} or ${balance} to a number`));
            return;
          }



          if (balance < baseSize) {
            reject(new Error(`Inufficient ${base} balance`))
            return
          }

          let stepSize;

          if (SymbolInfo.hasOwnProperty(pair) &&
            SymbolInfo[pair].hasOwnProperty('filters') &&
            SymbolInfo[pair].filters.hasOwnProperty('LOT_SIZE')) {
            stepSize = parseFloat(SymbolInfo[pair].filters['LOT_SIZE'].stepSize);
          }

          if (stepSize) {
            baseSize = Math.trunc(baseSize / stepSize);
            baseSize = baseSize * stepSize;
          }

          binance.marketSell(pair, `${baseSize}`, (err, res) => {
            if (err) {
              reject(new Error(err.body));
              return;
            }
            binance.balance((err, bal) => {
              if (err) {
                reject(err)
                return;
              }
              res.remainingBalance = `${bal[quote].available}`;
              resolve(res);
            });
          });
        });
      })
    })
  }
}


// //get list of current balances
// binance.balance((error, balances) => {
//   console.log("balances()", balances);
//   console.log("ETH balance: ", balances.ETH.available);
// });

// //get list of prices
// binance.prices((error, ticker) => {
//   console.log("prices()", ticker);
//   console.log("Price of BTC: ", ticker.BTCUSDT);
// });

// //get bid/ask for a symbol
// binance.bookTickers('BNBBTC', (error, ticker) => {
//   console.log("bookTickers", ticker);
// });

// //placing a limit order
// var quantity = 1, price = 0.069;
// binance.buy("ETHBTC", quantity, price);
// binance.sell("ETHBTC", quantity, price);

// //placing a market order
// var quantity = 1;
// binance.marketBuy("BNBBTC", quantity);
// binance.marketSell("ETHBTC", quantity);