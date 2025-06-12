const response = await Functions.makeHttpRequest({
    url: "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json",
    method: "GET"
})

if (response.error) {
  throw Error("Request failed");
}

const data = response.data;

let trigger = false;
for (let event of data.events || []) {
  if (event.type === "earthquake" && event.magnitude > 5.5) {
    trigger = true;
    break;
  }
}

return Functions.encodeUint256(trigger ? 1 : 0);