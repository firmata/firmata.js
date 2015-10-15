require("es6-shim");

var semver = require("semver");
var spawn = require("child_process").spawn;
var sp = {
  version: "1.7.4",
  get atVersion() {
    return "serialport@" + sp.version;
  },
};

if (semver.gte(process.version, "3.0.0")) {
  sp.version = "latest";
}

var npm = spawn("npm", ["install", sp.atVersion]);

npm.stdout.on("data", function(data) {
  var received = data.toString("utf8");
  var matches;

  if (received) {
    console.log(received);

    if (received.includes("serialport@")) {
      matches = received.match(/@(.*) /);

      if (matches.length) {
        sp.version = matches[1];
      }
    }
  }
});

npm.on("close", function(code) {
  var result;
  if (code !== 0) {
    result = "installation failed. Error Code: " + code;
  } else {
    result = "installed.";
  }
  console.log(sp.atVersion, result);
});
