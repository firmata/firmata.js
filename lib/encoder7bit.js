/**
 * "Inspired" by Encoder7Bit.h/Encoder7Bit.cpp in the
 * Firmata source code.
 */
module.exports = {
    to7BitArray: function(data) {
        var shift = 0;
        var previous = 0;
        var output = [];

        data.forEach(function(byte) {
            if (shift == 0) {
                output.push(byte & 0x7f)
                shift++;
                previous = byte >> 7;
            } else {
                output.push(((byte << shift) & 0x7f) | previous);
                if (shift == 6) {
                    output.push(byte >> 1);
                    shift = 0;
                } else {
                    shift++;
                    previous = byte >> (8 - shift);
                }
            }
        })

        if (shift > 0) {
            output.push(previous);
        }

        return output;
    },
    from7BitArray: function(encoded) {
        var expectedBytes = (encoded.length) * 7 >> 3;
        var decoded = [];

        for (var i = 0; i < expectedBytes ; i++) {
            var j = i << 3;
            var pos = parseInt(j/7);
            var shift = j % 7;
            decoded[i] = (encoded[pos] >> shift) | ((encoded[pos+1] << (7 - shift)) & 0xFF);
        }

        return decoded;
    }
}
