var firmata = process.env.FIRMATA_COV ? require('../lib-cov/firmata') : require('../lib/firmata');
var SerialPort = require('./MockSerialPort').SerialPort;
var should = require('should');
describe('board',function(){
    var boardStarted = false;
    var serialPort = new SerialPort('/path/to/fake/usb');
    var board = new firmata.Board(serialPort,function(err){
        'test error'.should.equal(err); 
    });
    serialPort.emit('error','test error');
    serialPort = new SerialPort('/path/to/fake/usb');
    
    board = new firmata.Board(serialPort,function(err){
        boardStarted = true;
        (typeof err).should.equal('undefined'); 
    });
    
    it('sends report version and query firmware if it hasnt received the version within the timeout', function(done) {
        // rcheck for report version
        serialPort.once('write', function (data) {
            data.should.equal(0xF9);
            // check for query firmware 
            serialPort.once('write', function (data) {
                data[0].should.equal(240);
                data[1].should.equal(121);
                data[2].should.equal(247);
                done();
            });
        });
    });
    
    it('receives the version on startup',function(done){
 
        //'send' report version command back from arduino
        serialPort.emit('data',[0xF9]);
        serialPort.emit('data',[0x02]);
        //subscribe to the 'data' event to capture the event
        serialPort.once('data',function(buffer){
            board.version.major.should.equal(2);
            board.version.minor.should.equal(3);
            done();
        });
        //send the last byte of command to get 'data' event to fire when the report version function is called
        serialPort.emit('data',[0x03]);
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

    it('gets the capabilities after the firmware',function(done){
        //[START_SYSEX, CAPABILITY_QUERY, END_SYSEX]
        serialPort.lastWrite.indexOf(0xF0).should.equal(0);
        serialPort.lastWrite.indexOf(0x6B).should.equal(1);
        serialPort.lastWrite.indexOf(0xF7).should.equal(2);
        //report back mock capabilities
        //taken from boards.h for arduino uno
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x6C]);
        for(var i = 0;i<20;i++){
            // if "pin" is digital it can be input and output
            if(i>=2 && i <=19 ){
                //input is on
                serialPort.emit('data',[0]);
                serialPort.emit('data',[1]);
                //output is on
                serialPort.emit('data',[1]);
                serialPort.emit('data',[1]);
            } 
            //if pin is analog
            if(i >=14 && i <=19){
                serialPort.emit('data',[0x02]);
                serialPort.emit('data',[10]);
            }
            //if pin is PWM
            if([3,5,6,10,11].indexOf(i) > -1){
                serialPort.emit('data',[0x03]);
                serialPort.emit('data',[8]);
            }
            //all pins are servo
            if(i >= 2){
                serialPort.emit('data',[0x04]);
                serialPort.emit('data',[14]);
            }
            //signal end of command for pin
            serialPort.emit('data',[127]);
        } 
        //capture the event once to make all pin modes are set correctly
        serialPort.once('data',function(){
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

    it('querys analog mappings after capabilities',function(done){
        //[START_SYSEX, ANALOG_MAPPING_QUERY, END_SYSEX]
        serialPort.lastWrite.indexOf(0xF0).should.not.equal(-1);
        serialPort.lastWrite.indexOf(0x69).should.not.equal(-1);
        serialPort.lastWrite.indexOf(0xF7).should.not.equal(-1);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x6A]);
        for(var i =0;i < 20; i++){
            if(i >= 14 && i < 20){
                serialPort.emit('data',[i - 14]);    
            } else {
                serialPort.emit('data',[127]);
            }    
        }
        serialPort.once('data',function(){
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
    it('should now be started',function(){
        boardStarted.should.equal(true);
    });
    it('should be able to set pin mode on digital pin',function(done){
        board.pinMode(2,board.MODES.INPUT);
        serialPort.lastWrite[0].should.equal(0xF4);
        serialPort.lastWrite[1].should.equal(2);
        serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
        board.pins[2].mode.should.equal(board.MODES.INPUT);
        done(); 
    });
    it('should be able to read value of digital pin',function(done){
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
    it('should be able to set mode on analog pins',function(done){
        board.pinMode(board.analogPins[0],board.MODES.INPUT);
        serialPort.lastWrite[0].should.equal(0xF4);
        serialPort.lastWrite[1].should.equal(board.analogPins[0]);
        serialPort.lastWrite[2].should.equal(board.MODES.INPUT);
        done();
    });
    it('should be able to read value of analog pin',function(done){
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
    it('should be able to write a value to a digital output',function(done){
        board.digitalWrite(3,board.HIGH);
        serialPort.lastWrite[0].should.equal(0x90);
        serialPort.lastWrite[1].should.equal(8);
        serialPort.lastWrite[2].should.equal(0);
        board.digitalWrite(3,board.LOW);
        serialPort.lastWrite[0].should.equal(0x90);
        serialPort.lastWrite[1].should.equal(0);
        serialPort.lastWrite[2].should.equal(0);
        done();
    });
    it('should be able to write a value to a analog output',function(done){
        board.analogWrite(board.analogPins[1],1023);
        serialPort.lastWrite[0].should.equal(0xE0 | board.analogPins[1]);
        serialPort.lastWrite[1].should.equal(127);
        serialPort.lastWrite[2].should.equal(7);
        board.analogWrite(board.analogPins[1],0);
        serialPort.lastWrite[0].should.equal(0xE0 | board.analogPins[1]);
        serialPort.lastWrite[1].should.equal(0);
        serialPort.lastWrite[2].should.equal(0);
        done();
    });
    it('should be able to send an i2c config',function(done){
        board.sendI2CConfig(1);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x78);
        serialPort.lastWrite[2].should.equal(1 & 0xFF);
        serialPort.lastWrite[3].should.equal((1 >> 8) & 0xFF);
        serialPort.lastWrite[4].should.equal(0xF7);
        done();
    });
    it('should be able to send an i2c request',function(done){
        board.sendI2CWriteRequest(0x68,[1,2,3]);
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x76);
        serialPort.lastWrite[2].should.equal(0x68);
        serialPort.lastWrite[3].should.equal(0 << 3);
        serialPort.lastWrite[4].should.equal(1 & 0x7F);
        serialPort.lastWrite[5].should.equal((1 >> 7) & 0x7F);
        serialPort.lastWrite[6].should.equal(2 & 0x7F);
        serialPort.lastWrite[7].should.equal((2 >> 7) & 0x7F);
        serialPort.lastWrite[8].should.equal(3 & 0x7F);
        serialPort.lastWrite[9].should.equal((3 >> 7) & 0x7F);
        serialPort.lastWrite[10].should.equal(0xF7);
        done();
    });
    it('should be able to receive an i2c reply',function(done){
        board.sendI2CReadRequest(0x68,4,function(data){
            data[0].should.equal(1);
            data[1].should.equal(2);
            data[2].should.equal(3);
            data[3].should.equal(4);
            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x76);
        serialPort.lastWrite[2].should.equal(0x68);
        serialPort.lastWrite[3].should.equal(1<<3);
        serialPort.lastWrite[4].should.equal(4 & 0x7F);
        serialPort.lastWrite[5].should.equal((4 >> 7) & 0x7F );
        serialPort.lastWrite[6].should.equal(0xF7);
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
    it('should emit a string event',function(done){
        board.on('string',function(string){
            string.should.equal('test string'); 
            done(); 
        });
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x71]);
        var bytes = new Buffer('test string','utf8');
        Array.prototype.forEach.call(bytes,function(value,index){
           serialPort.emit('data',[value]); 
        });
        serialPort.emit('data',[0xF7]);
    });
    it('can query pin state',function(done){
        board.queryPinState(2,function(){
            board.pins[2].value.should.equal(1024);
            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x6D);
        serialPort.lastWrite[2].should.equal(2);
        serialPort.lastWrite[3].should.equal(0xF7);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x6E]);
        serialPort.emit('data',[2]);
        serialPort.emit('data',[board.MODES.INPUT]);
        serialPort.emit('data',[1024]);
        serialPort.emit('data',[0xF7]);
    });
    it('can send a pulseIn without a timeout and without a pulse out',function(done){
        board.pulseIn({pin : 3, value: board.HIGH}, function(duration){
            duration.should.equal(0);  
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
        serialPort.lastWrite[10].should.equal(0);
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
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0xF7]);
    });
    it('can send a pulseIn with a timeout and without a pulse out',function(done){
        board.pulseIn({pin : 3, value: board.HIGH, timeout: 1000000} ,function(duration){
            duration.should.equal(0);  
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
        serialPort.lastWrite[10].should.equal(0);
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
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0]);
        serialPort.emit('data',[0xF7]);
    });
    it('can send a pulseIn with a timeout and a pulse out',function(done){
        board.pulseIn({pin : 3, value: board.HIGH, pulseOut: 5, timeout: 1000000}, function(duration){
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
    it('can send a pulseIn with a pulse out and without a timeout ',function(done){
        board.pulseIn({pin : 3, value: board.HIGH, pulseOut: 5}, function(duration){
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
    it('can send a stepper config for a driver configuration', function(done) {
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
    it('can send a stepper config for a two wire configuration', function(done) {
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
    it('can send a stepper config for a four wire configuration', function(done) {
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
    it('can send a stepper move without acceleration or deceleration', function(done) {
        board.stepperStep(2, board.STEPPER.DIRECTION.CCW, 10000, 2000, function(complete) {
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
    it('can send a stepper move with acceleration and deceleration', function(done) {
        board.stepperStep(3, board.STEPPER.DIRECTION.CCW, 10000, 2000, 3000, 8000, function(complete) {
            complete.should.equal(true);
            done();
        });
        serialPort.lastWrite[0].should.equal(0xF0);
        serialPort.lastWrite[1].should.equal(0x72);
        serialPort.lastWrite[2].should.equal(1);
        serialPort.lastWrite[3].should.equal(3);
        serialPort.lastWrite[4].should.equal(board.STEPPER.DIRECTION.CCW);
        serialPort.lastWrite[5].should.equal(10000 & 0x7F);
        serialPort.lastWrite[6].should.equal((10000 >> 7) & 0x7F);
        serialPort.lastWrite[7].should.equal((10000 >> 14) & 0x7F);
        serialPort.lastWrite[8].should.equal(2000 & 0x7F);
        serialPort.lastWrite[9].should.equal((2000 >> 7) & 0x7F);
        serialPort.lastWrite[10].should.equal(3000 & 0x7F);
        serialPort.lastWrite[11].should.equal((3000 >> 7) & 0x7F);
        serialPort.lastWrite[12].should.equal(8000 & 0x7F);
        serialPort.lastWrite[13].should.equal((8000 >> 7) & 0x7F);
        serialPort.lastWrite[14].should.equal(0xF7);
        serialPort.emit('data',[0xF0]);
        serialPort.emit('data',[0x72]);
        serialPort.emit('data',[3]);
        serialPort.emit('data',[0xF7]);
    });
});
