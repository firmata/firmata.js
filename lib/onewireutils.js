var Encoder7Bit = require('./encoder7bit');

OneWireUtils = {
    crc8: function(data) {
        var crc = 0;

        for(var i = 0; i < data.length; i++) {
            var inbyte = data[i];

            for (var n = 8; n; n--) {
                var mix = (crc ^ inbyte) & 0x01;
                crc >>= 1;

                if (mix) {
                    crc ^= 0x8C;
                }

                inbyte >>= 1;
            }
        }
        return crc;
    },

    readDevices: function(data) {
        var deviceBytes = Encoder7Bit.from7BitArray(data);
        var devices = [];

        for(var i = 0; i < deviceBytes.length; i += 8) {
            var device = deviceBytes.slice(i, i + 8);

			if(device.length != 8) {
				continue;
			}

            var check = OneWireUtils.crc8(device.slice(0, 7));

            if(check != device[7]) {
                console.error("ROM invalid!");
            }

            devices.push(device);
        }

        return devices;
    }
};

module.exports = OneWireUtils;
