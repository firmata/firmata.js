global.IS_TEST_MODE = true;

// Built-in Dependencies
global.cp = require("child_process");
global.Emitter = require("events").EventEmitter;
global.fs = require("fs");
global.path = require("path");

// Third-Party Dependencies
global.assert = require("should");
global.browserify = require("browserify");
global.sinon = require("sinon");
global.webpack = require("webpack");

// Internal Dependencies
global.Encoder7Bit = require("../../lib/encoder7bit");
global.OneWire = require("../../lib/onewireutils");
global.com = require("../../lib/com");
global.firmata = process.env.FIRMATA_COV ?
  require("../../lib-cov/firmata") :
  require("../../lib/firmata");


