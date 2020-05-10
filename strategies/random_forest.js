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

var IrisDataset = require('ml-dataset-iris');
var RFClassifier =  require('ml-random-forest');

// Let's create our own strat
var strat = {};


// Prepare everything our method needs
strat.init = function () {

  this.price_history = new PriceHistory();
  // Inputs

  this.time = 0;

  let rawdata = fs.readFileSync('dataset.json');
  var trainingSet  = JSON.parse(rawdata);

  // Expected value
  let rawdata_pred = fs.readFileSync('dataset_result.json');
  var predictions =  JSON.parse(rawdata_pred);

  var options = {
    seed: 10,
    maxFeatures: 0.8,
    replacement: true,
    nEstimators: 200
  };

  this.classifier = new RFClassifier.RandomForestClassifier(options);
  this.classifier.train(trainingSet, predictions);
  // var result = classifier.predict(trainingSet);
  // console.log(result);

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
  this.addIndicator('rsi', 'RSI', this.settings);


  this.input = 'candle';
  this.currentTrend = 'long';
  this.requiredHistory = 0;

};

// What happens on every new candle?
strat.update = function (candle) {
  this.price_history.push(candle, this.indicators.rsi);

  this.time += 1;


};

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function (candle) {

  if( this.time > this.settings.input_length){
    let input = [ this.price_history.getSlice(this.time-this.settings.input_length,  this.settings.input_length )];
    let result = this.classifier.predict(input)[0];

   if(result === 1){
     console.log("predcting long");
     this.advice('long');
   }
   else {
     console.log("predcting short");

     this.advice('short');
   }
  }

};

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
      console.log(this.buffer);

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

  getForecastForTime(time, horizon){
    console.log(time);
    console.log(this.history.length);
    let price_time = this.history[time].candle.close;
    let horizon_index = time+horizon;
    let price_horizon = this.history[horizon_index].candle.close;


    if( price_time < price_horizon)
      return 1;
    else
      return 0;

  }

  getSlice(offset, size){
    return this.history.slice(offset, offset+size).map( (item) => item.macd );
  }

}


module.exports = strat;
