const fs = require("fs");

module.exports = {
  source: fs.readFileSync("./functions/source.js").toString(),
  secrets: {},
  args: [],
};