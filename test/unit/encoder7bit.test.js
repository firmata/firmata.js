require("../common/bootstrap");

describe("Encoder7Bit", function () {
  it("must encode and decode via in-memory array", function (done) {
    var input = [40, 219, 239, 33, 5, 0, 0, 93, 0, 0, 0, 0, 0, 0, 0, 0];
    var encoded = Encoder7Bit.to7BitArray(input);
    var decoded = Encoder7Bit.from7BitArray(encoded);

    assert.deepEqual(decoded, input);
    done();
  });
});
