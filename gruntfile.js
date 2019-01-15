module.exports = function (grunt) {

  const globs = [
    "gruntfile.js",
    "packages/firmata-io/lib/*.js",
    "packages/firmata.js/lib/*.js",
    "packages/firmata.js/test/*.js",
    "test/*.js",
    "examples/*.js"
  ];

  grunt.initConfig({
    mochaTest: {
      files: [
        "packages/firmata.js/test/common/bootstrap.js",
        "packages/firmata.js/test/unit/*.js",
        "test/unit/*.js",
      ],
    },
    eslint: {
      target: globs,
      options: {
        configFile: ".eslint.json"
      }
    },
    jsbeautifier: {
      files: globs,
      options: {
        js: {
          braceStyle: "collapse",
          breakChainedMethods: false,
          e4x: false,
          evalCode: false,
          indentChar: " ",
          indentLevel: 0,
          indentSize: 2,
          indentWithTabs: false,
          jslintHappy: false,
          keepArrayIndentation: false,
          keepFunctionIndentation: false,
          maxPreserveNewlines: 10,
          preserveNewlines: true,
          spaceBeforeConditional: true,
          spaceInParen: false,
          unescapeStrings: false,
          wrapLineLength: 0
        }
      }
    },
  });

  grunt.registerTask("test", ["mochaTest"]);
  grunt.registerTask("default", ["eslint", "mochaTest"]);
  grunt.loadNpmTasks("grunt-eslint");
  grunt.loadNpmTasks("grunt-mocha-test");
  grunt.loadNpmTasks("grunt-jsbeautifier");


  grunt.registerTask("test:file", "Run a single test specified by a target; usage: grunt test:file:<module-name>[.js]", function(file) {
    if (file) {
      grunt.config("mochaTest.files", [
        "test/common/bootstrap.js",
        `test/unit/${file}.js`
      ]);
    }

    grunt.task.run("mochaTest");
  });
};
