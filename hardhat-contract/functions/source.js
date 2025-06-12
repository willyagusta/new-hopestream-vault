const response = await Functions.makeHttpRequest({
    url: "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
    method: "GET"
})

if (response.error) {
  throw Error("Request failed");
}

const data = response.data;

let quakeDetected = false;
for (let event of data.events || []) {
  if (event.type === "earthquake" && event.magnitude > 6.0) {
    quakeDetected = true;
    break;
  }
}

return Functions.encodeBool(quakeDetected);