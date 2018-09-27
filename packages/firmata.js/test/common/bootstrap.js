process.env.IS_TEST_MODE = true;

// Built-in Dependencies
global.cp = require("child_process");
global.Emitter = require("events");
global.fs = require("fs");
global.path = require("path");

// Third-Party Dependencies
global.assert = require("should");
global.browserify = require("browserify");
global.sinon = require("sinon");
global.webpack = require("webpack");

// Internal Dependencies
global.Encoder7Bit = require("../../../../packages/firmata-io/lib/encoder7bit");
global.OneWire = require("../../../../packages/firmata-io/lib/onewireutils");
global.com = require("../../lib/com");

global.firmata = require("../../lib/firmata");

// Fixtures
global.fixtures = {
  unexpected: {
    adc: require("../../test/unit/fixtures/unexpected-data-adc"),
    i2c: require("../../test/unit/fixtures/unexpected-data-i2c"),
    serial: require("../../test/unit/fixtures/unexpected-data-serial"),
  }
};
