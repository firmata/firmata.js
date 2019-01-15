# Firmata-io

This is Firmata.js without a default `Transport`.

# Install

Install Firmata-io:

```sh
npm install firmata-io --save
```

Install a Transport: 


```sh
npm install serialport --save
```

## Transports

- Serialport
- Etherport

# Basic Usage

## With A _Transport Class_

Here's an example using the `Serialport` class:

```js
// Require your Transport!
const Serialport = require("serialport"); 
// Pass the Transport class to the transport binding 
// function exported by firmata-io. The transport binding
// function will return the Firmata class object with
// the Transport class bound in its scope. 
const Firmata = require("firmata-io")(Serialport);

Firmata.requestPort((error, port) => {
  if (error) {
    console.log(error);
    return;
  }

  const board = new Firmata(port.comName);

  board.on("close", () => {
    // Unplug the board to see this event!
    console.log("Closed!");
  });
});
```

## With A _Transport Instance_

Here's an example using a `Serialport` instance:

```js
// Require your Transport!
const Serialport = require("serialport");
// Get the Firmata class without a bound transport. 
const Firmata = require("firmata-io").Firmata;

Serialport.list().then(ports => {
  // Figure which port to use...
  const port = ports.find(port => port.manufacturer.startsWith("Arduino"));
  
  // Instantiate an instance of your Transport class
  const transport = new Serialport(port.comName);

  // Pass the new instance directly to the Firmata class
  const board = new Firmata(transport);

  board.on("close", () => {
    // Unplug the board to see this event!
    console.log("Closed!");
  });
});
```


## License

(The MIT License)

Copyright (c) 2011-2015 Julian Gautier <julian.gautier@alumni.neumont.edu>\
Copyright (c) 2015-2019 The Firmata.js Authors (see AUTHORS.md)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
