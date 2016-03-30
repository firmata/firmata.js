var entry = path.join(__dirname, "/fixtures/entry.js");
var output = path.join(__dirname, "/fixtures/output.js");
var source = fs.readFileSync(path.join(__dirname, "/../../lib/firmata.js"), "utf8");
var lines = source.split("\n").map(function(line) {
  return line.trim();
});
var startAt = lines.indexOf("* constants");

describe("Bundling", function() {

  beforeEach(function() {
    fs.writeFileSync(output, "");
  });

  afterEach(function() {
    fs.unlinkSync(output);
  });

  it("must browserify", function(done) {
    this.timeout(2500);
    var b = browserify(entry);

    b.bundle(function(error, buffer) {
      var bundle = buffer.toString();
      assert.equal(error, null);
      lines.slice(startAt).forEach(function(line) {
        assert.equal(bundle.includes(line), true);
      });
      done();
    });
  });

  it("must webpack", function(done) {
    this.timeout(5000);
    var w = webpack({
      entry: entry,
      output: {
        filename: output
      }
    });

    w.run(function(error, stats) {
      assert.equal(error, null);

      var bundle = fs.readFileSync(output, "utf8");

      lines.slice(startAt).forEach(function(line) {
        assert.equal(bundle.includes(line), true);
      });
      done();
    });
  });
});
