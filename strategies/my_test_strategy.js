// This is a basic example strategy for Gekko.
// For more information on everything please refer
// to this document:
//
// https://gekko.wizb.it/docs/strategies/creating_a_strategy.html
//
// The example below is pretty bad investment advice: on every new candle there is
// a 10% chance it will recommend to change your position (to either
// long or short).

var _ = require('lodash');
var log = require('../core/log');
var fs = require('fs');

// Let's create our own strat
var strat = {};


// Prepare everything our method needs
strat.init = function () {
  this.time = 0;
  this.history = new History(this.settings.history_length, this.settings.history_buffer);
  this.price_history = new PriceHistory();

  fs.writeFile('dataset.json', '[', function (err) {
    if (err) throw err;
  });

  fs.writeFile('dataset_result.json', '[', function (err) {
    if (err) throw err;
  });

  // keep state about the current trend
  // here, on every new candle we use this
  // state object to check if we need to
  // report it.
  this.trend = {
    direction: 'none',
    duration: 0,
    persisted: false,
    adviced: false
  };

  // how many candles do we need as a base
  // before we can start giving advice?
  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('rsi', 'RSI', this.settings);
  // this.addIndicator('macd', 'MACD', this.settings);

  this.input = 'candle';
  this.currentTrend = 'long';
  this.requiredHistory = 0;

};

// What happens on every new candle?
strat.update = function (candle) {
  let RSI_value = this.indicators.rsi.result;
  this.history.push(candle);
  this.price_history.push(candle, RSI_value);

  // lenght of the last horizon ( second )
  let horizon_length = this.settings.horizon_length + this.settings.horizon_length;

  let buffer_length = horizon_length + this.settings.input_length;

  if( this.time > buffer_length &&  this.time - buffer_length < this.settings.dataset_size) {
    let input_at_time = this.price_history.getSlice(this.time - this.settings.input_length, this.settings.input_length);
    let result_at_time = this.price_history.getForecastForTime(this.time - horizon_length, this.settings.horizon_length);

    this.write_dataset(input_at_time, result_at_time);
  }


  if( this.time + buffer_length == this.settings.dataset_size)
    this.endCollecting();

  this.time += 1;
};

strat.write_dataset= function (input, result){
  let line_input = JSON.stringify(input);
  let line_result = JSON.stringify(result);

  fs.appendFile('dataset.json', line_input + ",\n", function (err) {
    if (err) throw err;
  });

  fs.appendFile('dataset_result.json', line_result + ",\n", function (err) {
    if (err) throw err;
  });
};

strat.endCollecting = function (){
  fs.appendFile('dataset.json', "]\n", function (err) {
    if (err) throw err;
  });

  fs.appendFile('dataset_result.json', "]\n", function (err) {
    if (err) throw err;
  });
};

strat.getFiboLevel = function (candle){
  let levels = this.getFiboRetracement();

  if( candle.close <= this.history.max) {
    if (candle.close >= levels.level1)
      return 1;
    if (candle.close >= levels.level2)
      return 2;
    if (candle.close >= levels.level3)
      return 3;
    if (candle.close >= this.history.min)
      return 4;
  }else{
    return 0;
  }

  return -1
};

strat.getFiboRetracement = function () {
  let diff = this.history.getDiff();
  let level1 = this.history.max - 0.236 * diff;
  let level2 = this.history.max - 0.382 * diff;
  let level3 = this.history.max - 0.618 * diff;

  return {
    level1,
    level2,
    level3
  };
};

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function (candle) {
 // this.updateTrend();
  let prc = candle.close;


  if( this.trend.direction === 'up'){
      if( this.getFiboLevel(candle) === 3 )this.advice('long');
      if( this.getFiboLevel(candle) === -1 )this.advice('short');

  }else{

    if( this.getFiboLevel(candle) === 3 )this.advice('short');
    if( this.getFiboLevel(candle) === -1 )this.advice('long');
  }
};

class PriceHistory{
  constructor() {
    this.history= [];

  }

  push(candle, macd){
    let item = {
      candle,
      macd
    }
    this.history.push(item);
  }

  getForecastForTime(time, horizon_length){
    let price_time = this.history[time].candle.close;
    let horizon_index = time+horizon_length;
    let price_horizon = this.history[horizon_index].candle.close;
    let double_horizon_index = time+horizon_length + horizon_length;
    let price_horizon_double = this.history[double_horizon_index].candle.close;


    console.log("Pricet at " + time + " is " + price_time + "\n");
    console.log("Pricet at " + horizon_index + " is " + price_horizon + "\n");
    console.log("Pricet at " + double_horizon_index + " is " + price_horizon_double + "\n");


    let flag = true;

    flag &= price_time < price_horizon;
    flag &= price_time < price_horizon_double;

    console.log("Result is " + flag + " \n \n");


    return flag;
  }

  getSlice(offset, size){
    return this.history.slice(offset, offset+size).map( (item) => item.macd );
  }

}

class History {
  constructor(history_length, history_buffer) {
    this.buffer = [];
    this.max = null;
    this.min = null;
    this.candles = [];
    this.history_length = history_length;
    this.history_buffer = history_buffer;

  }

  push(candle) {
    this.buffer.push(candle.close);

    if( this.buffer.length > this.history_buffer){
        this.candles = _.merge(this.buffer, this.candles);

      this.buffer = [];
    }

    if (this.candles.length  > this.history_length)
      this.candles.splice(0, this.candles.length - this.history_length);

    this.max = _.max(this.candles);
    this.min = _.min(this.candles);

  }

  getDiff() {
    return this.max - this.min;

  }
}

// strat.updateTrend = function (){
//   var macddiff = this.indicators.macd.result;
//
//   if(macddiff > this.settings.thresholds.up) {
//
//     // new trend detected
//     if(this.trend.direction !== 'up')
//     // reset the state for the new trend
//       this.trend = {
//         duration: 0,
//         persisted: false,
//         direction: 'up',
//         adviced: false
//       };
//
//     this.trend.duration++;
//
//     log.debug('In uptrend since', this.trend.duration, 'candle(s)');
//
//     if(this.trend.duration >= this.settings.thresholds.persistence)
//       this.trend.persisted = true;
//
//     if(this.trend.persisted && !this.trend.adviced) {
//       this.trend.adviced = true;
//     } else
//       this.advice();
//
//   } else if(macddiff < this.settings.thresholds.down) {
//
//     // new trend detected
//     if(this.trend.direction !== 'down')
//     // reset the state for the new trend
//       this.trend = {
//         duration: 0,
//         persisted: false,
//         direction: 'down',
//         adviced: false
//       };
//
//     this.trend.duration++;
//
//     log.debug('In downtrend since', this.trend.duration, 'candle(s)');
//
//     if(this.trend.duration >= this.settings.thresholds.persistence)
//       this.trend.persisted = true;
//
//     if(this.trend.persisted && !this.trend.adviced) {
//       this.trend.adviced = true;
//     } else
//         this.advice();
//   } else {
//
//
//     // we're not in an up nor in a downtrend
//     // but for now we ignore sideways trends
//     //
//     // read more @link:
//     //
//     // https://github.com/askmike/gekko/issues/171
//
//     // this.trend = {
//     //   direction: 'none',
//     //   duration: 0,
//     //   persisted: false,
//     //   adviced: false
//     // };
//
//   }
// }


module.exports = strat;
