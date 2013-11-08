var should = require('should'),
    OneWireUtils = require('../lib/onewireutils');
var Encoder7Bit = require('../lib/encoder7bit.js');
describe('board', function () {
    it('should CRC check data read from firmata', function (done) {
        var input = [0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D];
        var crcByte = OneWireUtils.crc8(input.slice(0, input.length - 1));

        crcByte.should.equal(input[input.length - 1]);

        done();
    });
    it('should return an invalid CRC check for corrupt data', function (done) {
        var input = [0x28, 0xDB, 0xEF, 0x22, 0x05, 0x00, 0x00, 0x5D];
        var crcByte = OneWireUtils.crc8(input.slice(0, input.length - 1));

        crcByte.should.not.equal(input[input.length - 1]);

        done();
    });
    it('should read device identifier', function (done) {
        var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
        var devices = OneWireUtils.readDevices(input);

        devices.length.should.equal(1);

        done();
    });
    it('should read device identifiers', function (done) {
        var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D]);
        var devices = OneWireUtils.readDevices(input);

        devices.length.should.equal(2);

        done();
    });
    it('should read only complete device identifiers', function (done) {
        var input = Encoder7Bit.to7BitArray([0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x28, 0xDB, 0xEF, 0x21, 0x05, 0x00, 0x00, 0x5D, 0x00, 0x01, 0x02]);
        var devices = OneWireUtils.readDevices(input);

        devices.length.should.equal(2);

        done();
    });
});
