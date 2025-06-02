const Functions = require("@chainlink/functions-toolkit");

module.exports = async () => {
  const url = "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json";

  const response = await Functions.makeHttpRequest({ url });

  if (!response || !response.data) {
    throw Error("No data from BMKG");
  }

  const mag = response.data.Infogempa.gempa[0].Magnitude;
  return Functions.encodeString(mag);
};