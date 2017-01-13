"use strict";

const Encoder7Bit = require("./encoder7bit");

module.exports = {
  crc8(data) {
    let crc = 0;

    for (let inbyte of data) {
      for (let n = 8; n; n--) {
        const mix = (crc ^ inbyte) & 0x01;
        crc >>= 1;

        if (mix) {
          crc ^= 0x8C;
        }

        inbyte >>= 1;
      }
    }

    return crc;
  },

  readDevices(data) {
    const bytes = Encoder7Bit.from7BitArray(data);
    const devices = [];

    for (let i = 0; i < bytes.length; i += 8) {
      const device = bytes.slice(i, i + 8);

      if (device.length !== 8) {
        continue;
      }

      const check = this.crc8(device.slice(0, 7));

      if (check !== device[7]) {
        console.error("ROM invalid!");
      }

      devices.push(device);
    }

    return devices;
  }
};
