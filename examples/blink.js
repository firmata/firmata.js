/**
 * Sample script to blink LED 13
 */


console.log('blink start ...');

var ledPin = 13;

var firmata = require('../lib/firmata');
var board = new firmata.Board('/dev/tty.usbmodemfd121', function(err) {
    if (err) {
        console.log(err);
        return;
    }
    console.log('connected');

    console.log('Firmware: ' + board.firmware.name + '-' + board.firmware.version.major + '.' + board.firmware.version.minor);

    var ledOn = true;
    board.pinMode(ledPin, board.MODES.OUTPUT);

    setInterval(function(){

	if (ledOn) {
        console.log('+');
        board.digitalWrite(ledPin, board.HIGH);
	}
	else {
        console.log('-');
        board.digitalWrite(ledPin, board.LOW);
	}

	ledOn = !ledOn;

    },500);

});
