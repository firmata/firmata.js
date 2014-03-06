var firmata = process.env.FIRMATA_COV ? require('../lib-cov/firmata') : require('../lib/firmata');
var SerialPort = require('./MockSerialPort').SerialPort;
var should = require('should'),
    Encoder7Bit = require('../lib/encoder7bit');

describe('board', function () {
    it('reports errors', function (done) {
        var serialPort = new SerialPort('/path/to/fake/usb');
        var board = new firmata.Board(serialPort, function (err) {
            'test error'.should.equal(err);
            done();
        });

        serialPort.emit('error', 'test error');
    });

    it('sends report version and query firmware if it hasnt received the version within the timeout', function (done) {
        this.timeout(50000);
        var serialPort = new SerialPort('/path/to/fake/usb');
        var opt = {
            reportVersionTimeout: 1
        };
        var board = new firmata.Board(serialPort, opt, function (err) { });

        // rcheck for report version
        serialPort.once('write', function (data) {
            should.deepEqual(data, [0xF9]);
            // check for query firmware
            serialPort.once('write', function (data) {
                should.deepEqual(data, [240, 121, 247]);
                done();
            });
        });
    });

    var serialPort = new SerialPort('/path/to/fake/usb');
    var boardStarted = false;
    var board = new firmata.Board(serialPort, function (err) {
        boardStarted = true;
        (typeof err).should.equal('undefined');
    });

    it('receives the version on startup', function (done) {
        //'send' report version command back from arduino
        serialPort.emit('data', [0xF9]);
        serialPort.emit('data', [0x02]);

        //subscribe to the 'data' event to capture the event
        serialPort.once('data', function (buffer) {
            board.version.major.should.equal(2);
            board.version.minor.should.equal(3);
            done();
        });

        //send the last byte of command to get 'data' event to fire when the report version function is called
        serialPort.emit('data', [0x03]);
    });

    it('receives the firmware after the version', function (done) {
        board.once('queryfirmware', function () {
            board.firmware.version.major.should.equal(2);
            board.firmware.version.minor.should.equal(3);
            board.firmware.name.should.equal('StandardFirmata');
            done();
        });
        serialPort.emit('data', [240]);
        serialPort.emit('data', [121]);
        serialPort.emit('data', [2]);
        serialPort.emit('data', [3]);
        serialPort.emit('data', [83]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [116]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [97]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [110]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [100]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [97]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [114]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [100]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [70]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [105]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [114]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [109]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [97]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [116]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [97]);
        serialPort.emit('data', [0]);
        serialPort.emit('data', [247]);
    });

    it('gets the capabilities after the firmware', function (done) {
        //[START_SYSEX, CAPABILITY_QUERY, END_SYSEX]
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x6B, 0xF7]);

        //report back mock capabilities
        //taken from boards.h for arduino uno
        serialPort.emit('data', [0xF0]);
        serialPort.emit('data', [0x6C]);

        for (var i = 0; i<20; i++) {
            // if "pin" is digital it can be input and output
            if (i>=2 && i <=19 ) {
                //input is on
                serialPort.emit('data',[0]);
                serialPort.emit('data',[1]);
                //output is on
                serialPort.emit('data',[1]);
                serialPort.emit('data',[1]);
            }
            //if pin is analog
            if (i >=14 && i <=19) {
                serialPort.emit('data',[0x02]);
                serialPort.emit('data',[10]);
            }
            //if pin is PWM
            if ([3,5,6,10,11].indexOf(i) > -1) {
                serialPort.emit('data',[0x03]);
                serialPort.emit('data',[8]);
            }
            //all pins are servo
            if (i >= 2) {
                serialPort.emit('data',[0x04]);
                serialPort.emit('data',[14]);
            }
            //signal end of command for pin
            serialPort.emit('data',[127]);
        }

        //capture the event once to make all pin modes are set correctly
        serialPort.once('data', function () {
            board.pins.length.should.equal(20);
            board.pins.forEach(function(value,index){
                if(index >=2 && index <=19){
                    value.supportedModes.indexOf(0).should.not.equal(-1);
                    value.supportedModes.indexOf(1).should.not.equal(-1);
                } else {
                    value.supportedModes.length.should.equal(0);
                }
                if(index >=14 && index <=19){
                    value.supportedModes.indexOf(0x02).should.not.equal(-1);
                } else {
                    value.supportedModes.indexOf(0x02).should.equal(-1);
                }
                if([3,5,6,10,11].indexOf(index) > -1){
                    value.supportedModes.indexOf(0x03).should.not.equal(-1);
                } else {
                    value.supportedModes.indexOf(0x03).should.equal(-1);
                }
                if(index >=2){
                    value.supportedModes.indexOf(0x04).should.not.equal(-1);
                }
            });
            done();
        });
        //end the sysex message
        serialPort.emit('data',[0xF7]);
    });

    it('querys analog mappings after capabilities', function (done) {
        //[START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x69, 0xF7]);

        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x6A]);
        for (var i =0;i < 20; i++) {
            if (i >= 14 && i < 20) {
                serialPort.emit('data',[i - 14]);
            } else {
                serialPort.emit('data',[127]);
            }
        }

        serialPort.once('data', function () {
            board.pins[14].analogChannel.should.equal(0);
            board.pins[15].analogChannel.should.equal(1);
            board.pins[16].analogChannel.should.equal(2);
            board.pins[17].analogChannel.should.equal(3);
            board.pins[18].analogChannel.should.equal(4);
            board.pins[19].analogChannel.should.equal(5);
            board.analogPins.length.should.equal(6);
            board.analogPins[0].should.equal(14);
            board.analogPins[1].should.equal(15);
            board.analogPins[2].should.equal(16);
            board.analogPins[3].should.equal(17);
            board.analogPins[4].should.equal(18);
            board.analogPins[5].should.equal(19);
            done();
        });
        serialPort.emit('data',[0xF7]);
    });

    it('should now be started', function () {
        boardStarted.should.equal(true);
    });

    it('should be able to set pin mode on digital pin', function (done) {
        board.pinMode(2,board.MODES.INPUT);
        serialPort.lastWrite[0].should.equal(0xF4);
        serialPort.lastWrite[1].should.equal(2);
        serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
        board.pins[2].mode.should.equal(board.MODES.INPUT);
        done();
    });

    it('should be able to read value of digital pin', function (done) {
        var counter = 0;
        var order = [1, 0, 1, 0];
        board.digitalRead(2,function(value){
            if (value === 1) {
                counter++;
            }
            if (value === 0) {
                counter++;
            }
            if (order[0] === value) {
                order.shift();
            }
            if (counter === 4) {
                order.length.should.equal(0);
                done();
            }
        });
        // Single Byte
        serialPort.emit('data',[0x90]);
        serialPort.emit('data',[4%128]);
        serialPort.emit('data',[4>>7]);

        serialPort.emit('data',[0x90]);
        serialPort.emit('data',[0x00]);
        serialPort.emit('data',[0x00]);

        // Multi Byte
        serialPort.emit('data',[0x90, 4%128, 4>>7]);
        serialPort.emit('data',[0x90, 0x00, 0x00]);
    });

    it('should be able to set mode on analog pins', function (done) {
        board.pinMode(board.analogPins[0],board.MODES.INPUT);
        serialPort.lastWrite[0].should.equal(0xF4);
        serialPort.lastWrite[1].should.equal(board.analogPins[0]);
        serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
        done();
    });

    it('should be able to read value of analog pin', function (done) {
        var counter = 0;
        var order = [1023, 0, 1023, 0];
        board.analogRead(1,function(value){
            if (value === 1023) {
                counter++;
            }
            if (value === 0) {
                counter++;
            }
            if (order[0] === value) {
                order.shift();
            }
            if (counter === 4) {
                order.length.should.equal(0);
                done();
            }
        });
        // Single Byte
        serialPort.emit('data',[0xE0 | (1 & 0xF)]);
        serialPort.emit('data',[1023%128]);
        serialPort.emit('data',[1023>>7]);

        serialPort.emit('data',[0xE0 | (1 & 0xF)]);
        serialPort.emit('data',[0%128]);
        serialPort.emit('data',[0>>7]);

        // Multi Byte
        serialPort.emit('data',[0xE0 | (1 & 0xF), 1023%128, 1023>>7]);
        serialPort.emit('data',[0xE0 | (1 & 0xF), 0%128, 0>>7]);
    });

    it('should be able to write a value to a digital output', function (done) {
        board.digitalWrite(3,board.HIGH);
        should.deepEqual(serialPort.lastWrite, [0x90, 8, 0]);

        board.digitalWrite(3,board.LOW);
        should.deepEqual(serialPort.lastWrite, [0x90, 0, 0]);

        done();
    });

    it('should be able to write a value to a analog output', function (done) {
        board.analogWrite(board.analogPins[1], 1023);
        should.deepEqual(serialPort.lastWrite, [0xE0 | board.analogPins[1], 127, 7]);

        board.analogWrite(board.analogPins[1], 0);
        should.deepEqual(serialPort.lastWrite, [0xE0 | board.analogPins[1], 0, 0]);
        done();
    });

    it('should be able to write a value to an extended analog output', function (done) {
        var length = board.pins.length;

        board.pins[46] = {
            supportedModes: [0, 1, 4],
            mode: 4,
            value: 0,
            report: 1,
            analogChannel: 127
        };


        board.analogWrite(46, 180);
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x6F, 46, 52, 1, 0xF7]);

        board.analogWrite(46, 0);
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x6F, 46, 0, 0, 0xF7]);

        // Restore to original length
        board.pins.length = length;

        done();
    });

    it('should be able to send an i2c config', function (done) {
        board.sendI2CConfig(1);
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x78, 1 & 0xFF, (1 >> 8) & 0xFF, 0xF7]);
        done();
    });

    it('should be able to send an i2c request', function (done) {
        board.sendI2CWriteRequest(0x68, [1,2,3]);
        var request = [0xF0, 0x76, 0x68, 0 << 3, 1 & 0x7F, (1 >> 7) & 0x7F, 2 & 0x7F, (2 >> 7) & 0x7F, 3 & 0x7F, (3 >> 7) & 0x7F, 0xF7];
        should.deepEqual(serialPort.lastWrite, request);
        done();
    });

    it('should be able to receive an i2c reply', function (done) {
        board.sendI2CReadRequest(0x68, 4, function (data) {
            should.deepEqual(data, [1, 2, 3, 4]);
            done();
        });
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x76, 0x68, 1<<3, 4 & 0x7F, (4 >> 7) & 0x7F, 0xF7]);

        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x77]);
        serialPort.emit('data',[0x68 % 128]);
        serialPort.emit('data',[0x68 >> 7]);
        serialPort.emit('data',[1]);
        serialPort.emit('data',[1]);
        serialPort.emit('data',[1 & 0x7F]);
        serialPort.emit('data',[(1 >> 7) & 0x7F]);
        serialPort.emit('data',[2 & 0x7F]);
        serialPort.emit('data',[(2 >> 7) & 0x7F]);
        serialPort.emit('data',[3 & 0x7F]);
        serialPort.emit('data',[(3 >> 7) & 0x7F]);
        serialPort.emit('data',[4 & 0x7F]);
        serialPort.emit('data',[(4 >> 7) & 0x7F]);
        serialPort.emit('data',[0xF7]);
    });
    it('should be able to send a string', function (done){
        var bytes = new Buffer('test string','utf8');
        var length = bytes.length;
        board.sendString(bytes);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x71);
        for (var i = 0; i < length; i++) {
            serialPort.lastWrite[i*2 + 2].should.equal(bytes[i] & 0x7F);
            serialPort.lastWrite[i*2 + 3].should.equal((bytes[i + 1] >> 7) & 0x7F);
        }
        serialPort.lastWrite[length * 2 + 2].should.equal(0);
        serialPort.lastWrite[length * 2 + 3].should.equal(0);
        serialPort.lastWrite[length * 2 + 4].should.equal(0xF7);
        done();
    });
    it('should emit a string event', function (done) {
        board.on('string',function(string){
            string.should.equal('test string');
            done();
        });
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x71]);
        var bytes = new Buffer('test string','utf8');
        Array.prototype.forEach.call(bytes, function (value,index) {
           serialPort.emit('data',[value]);
        });
        serialPort.emit('data',[0xF7]);
    });

    it('can query pin state', function (done) {
        board.queryPinState(2,function(){
            board.pins[2].value.should.equal(1024);
            done();
        });
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x6D, 2, 0xF7]);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x6E]);
        serialPort.emit('data',[2]);
        serialPort.emit('data',[board.MODES.INPUT]);
        serialPort.emit('data',[1024]);
        serialPort.emit('data',[0xF7]);
    });

    it('can send a pulseIn without a timeout and without a pulse out', function (done) {
        board.pulseIn({pin : 3, value: board.HIGH, timeout: 1000000}, function (duration) {
            duration.should.equal(0);
            done();
        });
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x74, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 66, 0, 64, 0, 0xF7]);

        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x74]);
        serialPort.emit('data',[3]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0xF7]);
    });

    it('can send a pulseIn with a timeout and a pulse out', function (done) {
        board.pulseIn({pin : 3, value: board.HIGH, pulseOut: 5, timeout: 1000000}, function (duration) {
            duration.should.equal(1000000);
            done();
        });
        should.deepEqual(serialPort.lastWrite, [0xF0, 0x74, 3, board.HIGH, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 15, 0, 66, 0, 64, 0, 0xF7]);

        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x74]);
        serialPort.emit('data',[3]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[15]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[66]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[64]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0xF7]);
    });
    it('can send a pulseIn with a pulse out and without a timeout ',function (done) {
        board.pulseIn({pin : 3, value: board.HIGH, pulseOut: 5}, function (duration) {
            duration.should.equal(1000000);
            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x74);
        serialPort.lastWrite[2].should.equal(3);
        serialPort.lastWrite[3].should.equal(board.HIGH);
        serialPort.lastWrite[4].should.equal(0);
        serialPort.lastWrite[5].should.equal(0);
        serialPort.lastWrite[6].should.equal(0);
        serialPort.lastWrite[7].should.equal(0);
        serialPort.lastWrite[8].should.equal(0);
        serialPort.lastWrite[9].should.equal(0);
        serialPort.lastWrite[10].should.equal(5);
        serialPort.lastWrite[11].should.equal(0);
        serialPort.lastWrite[12].should.equal(0);
        serialPort.lastWrite[13].should.equal(0);
        serialPort.lastWrite[14].should.equal(15);
        serialPort.lastWrite[15].should.equal(0);
        serialPort.lastWrite[16].should.equal(66);
        serialPort.lastWrite[17].should.equal(0);
        serialPort.lastWrite[18].should.equal(64);
        serialPort.lastWrite[19].should.equal(0);
        serialPort.lastWrite[20].should.equal(0xF7);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x74]);
        serialPort.emit('data',[3]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[15]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[66]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[64]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0xF7]);
    });

    it('can send a stepper config for a driver configuration', function (done) {
        board.stepperConfig(0, board.STEPPER.TYPE.DRIVER, 200, 2, 3);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x72);
        serialPort.lastWrite[2].should.equal(0);
        serialPort.lastWrite[3].should.equal(0);
        serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.DRIVER);
        serialPort.lastWrite[5].should.equal(200 & 0x7F);
        serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
        serialPort.lastWrite[7].should.equal(2);
        serialPort.lastWrite[8].should.equal(3);
        serialPort.lastWrite[9].should.equal(0xF7);
        done();
    });

    it('can send a stepper config for a two wire configuration', function (done) {
        board.stepperConfig(0, board.STEPPER.TYPE.TWO_WIRE, 200, 2, 3);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x72);
        serialPort.lastWrite[2].should.equal(0);
        serialPort.lastWrite[3].should.equal(0);
        serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.TWO_WIRE);
        serialPort.lastWrite[5].should.equal(200 & 0x7F);
        serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
        serialPort.lastWrite[7].should.equal(2);
        serialPort.lastWrite[8].should.equal(3);
        serialPort.lastWrite[9].should.equal(0xF7);
        done();
    });

    it('can send a stepper config for a four wire configuration', function (done) {
        board.stepperConfig(0, board.STEPPER.TYPE.FOUR_WIRE, 200, 2, 3, 4, 5);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x72);
        serialPort.lastWrite[2].should.equal(0);
        serialPort.lastWrite[3].should.equal(0);
        serialPort.lastWrite[4].should.equal(board.STEPPER.TYPE.FOUR_WIRE);
        serialPort.lastWrite[5].should.equal(200 & 0x7F);
        serialPort.lastWrite[6].should.equal((200 >> 7) & 0x7F);
        serialPort.lastWrite[7].should.equal(2);
        serialPort.lastWrite[8].should.equal(3);
        serialPort.lastWrite[9].should.equal(4);
        serialPort.lastWrite[10].should.equal(5);
        serialPort.lastWrite[11].should.equal(0xF7);
        done();
    });

    it('can send a stepper move without acceleration or deceleration', function (done) {
        board.stepperStep(2, board.STEPPER.DIRECTION.CCW, 10000, 2000, function (complete) {
            complete.should.equal(true);
            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x72);
        serialPort.lastWrite[2].should.equal(1);
        serialPort.lastWrite[3].should.equal(2);
        serialPort.lastWrite[4].should.equal(board.STEPPER.DIRECTION.CCW);
        serialPort.lastWrite[5].should.equal(10000 & 0x7F);
        serialPort.lastWrite[6].should.equal((10000 >> 7) & 0x7F);
        serialPort.lastWrite[7].should.equal((10000 >> 14) & 0x7F);
        serialPort.lastWrite[8].should.equal(2000 & 0x7F);
        serialPort.lastWrite[9].should.equal((2000 >> 7) & 0x7F);
        serialPort.lastWrite[9].should.equal((2000 >> 7) & 0x7F);
        serialPort.lastWrite[10].should.equal(0xF7);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x72]);
        serialPort.emit('data',[2]);
        serialPort.emit('data',[0xF7]);
    });

    it('can send a stepper move with acceleration and deceleration', function (done) {
        board.stepperStep(3, board.STEPPER.DIRECTION.CCW, 10000, 2000, 3000, 8000, function(complete) {
            complete.should.equal(true);
            done();
        });

        var message = [0xF0, 0x72, 1, 3, board.STEPPER.DIRECTION.CCW, 10000 & 0x7F, (10000 >> 7) & 0x7F, (10000 >> 14) & 0x7F, 2000 & 0x7F, (2000 >> 7) & 0x7F, 3000 & 0x7F, (3000 >> 7) & 0x7F, 8000 & 0x7F, (8000 >> 7) & 0x7F, 0xF7];
        should.deepEqual(serialPort.lastWrite, message);

        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x72]);
        serialPort.emit('data',[3]);
        serialPort.emit('data',[0xF7]);
    });
    it('should be able to send a 1-wire config with parasitic power enabled',function(done){
        board.sendOneWireConfig(1, true);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x41);
        serialPort.lastWrite[3].should.equal(0x01);
        serialPort.lastWrite[4].should.equal(0x01);
        serialPort.lastWrite[5].should.equal(0xF7);
        done();
    });
    it('should be able to send a 1-wire config with parasitic power disabled',function(done){
        board.sendOneWireConfig(1, false);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x41);
        serialPort.lastWrite[3].should.equal(0x01);
        serialPort.lastWrite[4].should.equal(0x00);
        serialPort.lastWrite[5].should.equal(0xF7);
        done();
    });
    it('should be able to send a 1-wire search request and recieve a reply',function(done){
        board.sendOneWireSearch(1, function(error, devices) {
            devices.length.should.equal(1);

            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x40);
        serialPort.lastWrite[3].should.equal(0x01);
        serialPort.lastWrite[4].should.equal(0xF7);

        serialPort.emit('data',[0xF0, 0x73, 0x42, 0x01, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, 0xF7]);
    });
    it('should be able to send a 1-wire search alarm request and recieve a reply',function(done){
        board.sendOneWireAlarmsSearch(1, function(error, devices) {
            devices.length.should.equal(1);

            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x44);
        serialPort.lastWrite[3].should.equal(0x01);
        serialPort.lastWrite[4].should.equal(0xF7);

        serialPort.emit('data',[0xF0, 0x73, 0x45, 0x01, 0x28, 0x36, 0x3F, 0x0F, 0x52, 0x00, 0x00, 0x00, 0x5D, 0x00, 0xF7]);
    });
    it('should be able to send a 1-wire reset request',function(done) {
        board.sendOneWireReset(1);

        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x01);
        serialPort.lastWrite[3].should.equal(0x01);

        done();
    });
    it('should be able to send a 1-wire delay request',function(done) {
        var delay = 1000;

        board.sendOneWireDelay(1, delay);

        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x3C);
        serialPort.lastWrite[3].should.equal(0x01);

        // decode delay from request
        var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));
        var sentDelay = request[12] | (request[13] << 8) | (request[14] << 12) | request[15] << 24;
        sentDelay.should.equal(delay);

        done();
    });
    it('should be able to send a 1-wire write request',function(done) {
        var device = [40, 219, 239, 33, 5, 0, 0, 93];
        var data = 0x33;

        board.sendOneWireWrite(1, device, data);

        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x3C);
        serialPort.lastWrite[3].should.equal(0x01);

        // decode delay from request
        var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));

        // should select the passed device
        request[0].should.equal(device[0]);
        request[1].should.equal(device[1]);
        request[2].should.equal(device[2]);
        request[3].should.equal(device[3]);
        request[4].should.equal(device[4]);
        request[5].should.equal(device[5]);
        request[6].should.equal(device[6]);
        request[7].should.equal(device[7]);

        // and send the passed data
        request[16].should.equal(data);

        done();
    });
    it('should be able to send a 1-wire write and read request and recieve a reply',function(done) {
        var device = [40, 219, 239, 33, 5, 0, 0, 93];
        var data = 0x33;
        var output = [0x01, 0x02];

        board.sendOneWireWriteAndRead(1, device, data, 2, function(error, receieved) {
            receieved.should.eql(output);

            done();
        });

        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x73);
        serialPort.lastWrite[2].should.equal(0x3C);
        serialPort.lastWrite[3].should.equal(0x01);

        // decode delay from request
        var request = Encoder7Bit.from7BitArray(serialPort.lastWrite.slice(4, serialPort.lastWrite.length - 1));

        // should select the passed device
        request[0].should.equal(device[0]);
        request[1].should.equal(device[1]);
        request[2].should.equal(device[2]);
        request[3].should.equal(device[3]);
        request[4].should.equal(device[4]);
        request[5].should.equal(device[5]);
        request[6].should.equal(device[6]);
        request[7].should.equal(device[7]);

        // and send the passed data
        request[16].should.equal(data);

        var dataSentFromBoard = [];

        // respond with the same correlation id
        dataSentFromBoard[0] = request[10];
        dataSentFromBoard[1] = request[11];

        // data "read" from the 1-wire device
        dataSentFromBoard[2] = output[0];
        dataSentFromBoard[3] = output[1];

        serialPort.emit('data',[0xF0, 0x73, 0x43, 0x01].concat(Encoder7Bit.to7BitArray(dataSentFromBoard)).concat([0xF7]));
    });
});
