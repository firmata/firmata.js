var SerialPort;
try {
  /* istanbul ignore if */
  if (process.browser || parseFloat(process.versions.nw) >= 0.13) {
    SerialPort = require("browser-serialport");
  } else {
    /* istanbul ignore else */
    if (process.env.IS_TEST_MODE) {
      SerialPort = require("serialport/test");
    } else {
      SerialPort = require("serialport");
    }
  }
} catch (err) {
  console.log("It looks like SerialPort isn't available. It's possible that it didn't install properly. You can find details on how to install it on your system at https://github.com/EmergingTechnologyAdvisors/node-serialport#installation-instructions");
  throw new Error("Missing serialport dependency");
}

module.exports = SerialPort;
