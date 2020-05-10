var _ = require('lodash');
var log = require('../core/log');
var fs = require('fs');

var RFClassifier = require('ml-random-forest');

// Let's create our own strat
var strat = {};

// Prepare everything our method needs
strat.init = function () {
  this.is_trading = this.settings.trading_enabled == 1;
  this.price_history = new PriceHistory();

  this.is_trade_open = false;
  this.trade_duration = 0;

  this.time = 0;
  this.written_data_length = 0;

  this.input_filename = this.settings.dataset_filename;

  this.addIndicator('rsi', 'RSI', this.settings);

  if (this.is_trading) {
    console.log("Trading mode on.");
    this.trainClassifier(
      this.input_filename + '.json',
      this.input_filename + '_result.json');
  } else {
    console.log("Trading mode off, collecting datasets in '" + this.input_filename + '.json' + "' and '" + this.input_filename + '_result.json\'');
    this.init_dataset_files();
  }

};

strat.init_dataset_files = function () {
  fs.writeFile(this.input_filename + '.json', '[', function (err) {
    if (err) throw err;
  });

  fs.writeFile(this.input_filename + '_result.json', '[', function (err) {
    if (err) throw err;
  });
};

strat.write_dataset_line = function (input, result) {
  let line_input = JSON.stringify(input);
  let line_result = JSON.stringify(result);

  let concatenator = this.written_data_length == this.settings.dataset_size ? '' : ',';

  fs.appendFile(this.input_filename + '.json', line_input + concatenator +"\n", function (err) {
    if (err) throw err;
  });

  fs.appendFile(this.input_filename + '_result.json', line_result + concatenator + "\n", function (err) {
    if (err) throw err;
  });
};

strat.endCollecting = function (lines_written) {
  console.log("Succesfully written :" + lines_written);

  fs.appendFile('dataset.json', "]\n", function (err) {
    if (err) throw err;
  });

  fs.appendFile('dataset_result.json', "]\n", function (err) {
    if (err) throw err;
  });
};

strat.trainClassifier = function (input_filename, result_filename) {
  let rawdata = fs.readFileSync(input_filename);
  var trainingSet = JSON.parse(rawdata);

  // Expected value
  let rawdata_pred = fs.readFileSync(result_filename);
  var predictions = JSON.parse(rawdata_pred);

  var options = {
     seed: this.settings.input_length,
     maxFeatures: 0.50,
    replacement: false,
    nEstimators: 200
  };

  this.classifier = new RFClassifier.RandomForestClassifier(options);
  this.classifier.train(trainingSet, predictions);

};

// What happens on every new candle?
strat.update = function (candle) {
  let RSI_value = this.indicators.rsi.result;
  this.price_history.push(candle, RSI_value);

  if (!this.is_trading) {
    // lenght of the last horizon ( second )
    let horizon_length = this.settings.horizon_length * 2 ;

    let buffer_length = horizon_length + this.settings.input_length;

    if (this.time > buffer_length && this.written_data_length < this.settings.dataset_size) {
      let input_at_time = this.price_history.getSlice(this.time - this.settings.input_length, this.settings.input_length);
      let result_at_time = this.price_history.getForecastForTime(this.time - horizon_length, this.settings.horizon_length);

      this.written_data_length += 1;
      this.write_dataset_line(input_at_time, result_at_time);

    }


    if (this.written_data_length == this.settings.dataset_size) {
      this.endCollecting(this.written_data_length);
      this.written_data_length += 1;

    }
  }

  this.time += 1;

};

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function (candle) {

  if (!this.is_trading) return;

  if (this.time > this.settings.input_length) {

    let input = [this.price_history.getSlice(this.time - this.settings.input_length, this.settings.input_length)];
    let result = this.classifier.predict(input)[0];

    if( this.is_trade_open && this.trade_duration < this.settings.horizon_length + this.settings.horizon_length){
      console.log("A trade is open, not trading " + this.trade_duration);
      this.trade_duration += 1;
      return;
    }


    if (result === 1) {
      this.is_trade_open = true;
      console.log("predcting long");
      this.advice('long');
    } else {
      this.is_trade_open = false;
      this.trade_duration = 0;
      console.log("predcting short");

      this.advice('short');
    }
  }

};

class PriceHistory {
  constructor() {
    this.history = [];

  }

  push(candle, macd) {
    let item = {
      candle,
      macd
    };
    this.history.push(item);
  }

  getForecastForTime(time, horizon_length) {
    // TODO: add granurality by divinding the horizon
    let price_time = this.history[time].candle.close;
    let horizon_index = time + horizon_length;
    let price_horizon = this.history[horizon_index].candle.close;
    let double_horizon_index = time + horizon_length + horizon_length;
    let price_horizon_double = this.history[double_horizon_index].candle.close;

    let double_half_horizon_index = time + horizon_length + Math.ceil(horizon_length/2);
    let price_horizon_double_half = this.history[double_half_horizon_index].candle.close;



    // console.log("Pricet at " + time + " is " + price_time + "\n");
    //  console.log("Pricet at " + horizon_index + " is " + price_horizon + "\n");
    // console.log("Pricet at " + double_half_horizon_index + " is " + price_horizon_double_half + "\n");
    // console.log("Pricet at " + double_horizon_index + " is " + price_horizon_double + "\n");



    let flag = true;

    flag &= price_time < price_horizon;
    flag &= price_time < price_horizon_double_half;
    flag &= price_time < price_horizon_double;

     // console.log("Result is " + flag + " \n \n");


    return flag;
  }

  getSlice(offset, size) {
    return this.history.slice(offset, offset + size).map((item) => item.macd);
  }

}

module.exports = strat;
