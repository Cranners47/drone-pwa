let droneData = [];
let sensorData = [];

document.getElementById("processBtn").addEventListener("click", () => {
  if (droneData.length === 0 || sensorData.length === 0) {
    alert("Please upload both Drone and Sensor CSV files.");
    return;
  }

  const tolerance = parseFloat(document.getElementById("tolerance").value) || 20;
  const results = matchData(droneData, sensorData, tolerance);
  downloadCSV(results, "matched_data.csv");
});

document.getElementById("droneFile").addEventListener("change", (e) => {
  parseCSV(e.target.files[0], "drone");
});

document.getElementById("sensorFile").addEventListener("change", (e) => {
  parseCSV(e.target.files[0], "sensor");
});

function parseCSV(file, type) {
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    complete: function(results) {
      if (type === "drone") {
        droneData = results.data.map(row => ({
          timeMs: row["time(millisecond)"],
          datetime: row["datetime(utc)"],
          lat: parseFloat(row["latitude"]),
          lon: parseFloat(row["longitude"]),
          alt: parseFloat(row["altitude_above_seaLevel(meters)"])
        }));
      } else {
        sensorData = results.data.map(row => {
          let geo = row["GeoPosition"].replace("POINT(", "").replace(")", "").split(" ");
          return {
            objectID: row["ObjectID"],
            datasourceID: row["DatasourceID"],
            received: row["Received"],
            lat: parseFloat(geo[1]),
            lon: parseFloat(geo[0]),
            alt: row["Altitude"] !== null ? parseFloat(row["Altitude"]) : null
          };
        });
      }
      alert(`${type} CSV loaded: ${results.data.length} rows`);
    }
  });
}

function matchData(drone, sensor, tolerance) {
  const matched = [];

  // Convert sensor timestamps to Date objects
  sensor.forEach(s => {
    s.timestamp = new Date(s.received).getTime();
  });

  // Process drone data
  drone.forEach(d => {
    if (!d.datetime || !d.timeMs) return;

    // Construct timestamp: datetime(utc) + time(millisecond)
    let base = new Date(d.datetime).getTime();
    let timestamp = base + d.timeMs;

    // Find closest sensor record within ±100ms
    let closest = null;
    let minDiff = Infinity;

    for (let s of sensor) {
      let diff = Math.abs(s.timestamp - timestamp);
      if (diff < minDiff && diff <= 100) {
        minDiff = diff;
        closest = s;
      }
    }

    if (closest) {
      // Distance calculation
      let result = calculateDistance(
        d.lat, d.lon, d.alt,
        closest.lat, closest.lon, closest.alt
      );

      matched.push({
        Timestamp: d.datetime,
        "Truth Latitude": d.lat,
        "Truth Longitude": d.lon,
        "Truth Altitude": d.alt,
        "Sensor Latitude": closest.lat,
        "Sensor Longitude": closest.lon,
        "Sensor Altitude": closest.alt,
        "Distance between (m)": result.distance.toFixed(2),
        "Type of measurement": result.method,
        "Within Tolerance?": result.distance <= tolerance ? 1 : 0
      });
    }
  });

  return matched;
}

// Haversine formula for 2D and 3D distance
function calculateDistance(lat1, lon1, alt1, lat2, lon2, alt2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => deg * Math.PI / 180;

  let dLat = toRad(lat2 - lat1);
  let dLon = toRad(lon2 - lon1);

  let a = Math.sin(dLat/2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLon/2) ** 2;

  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  let horizontalDist = R * c;

  if (alt2 !== null && alt2 > 0) {
    let verticalDiff = (alt2 - alt1);
    let dist3D = Math.sqrt(horizontalDist**2 + verticalDiff**2);
    return { distance: dist3D, method: "3D" };
  } else {
    return { distance: horizontalDist, method: "2D" };
  }
}

function downloadCSV(data, filename) {
  if (data.length === 0) {
    alert("No matches found.");
    return;
  }
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
