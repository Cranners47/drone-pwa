// app.js

// Haversine formula for 2D distance (lat/lon)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = deg => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 3D distance: haversine + altitude difference
function distance3D(lat1, lon1, alt1, lat2, lon2, alt2) {
  const d2d = haversine(lat1, lon1, lat2, lon2);
  const dAlt = (alt1 || 0) - (alt2 || 0);
  return Math.sqrt(d2d ** 2 + dAlt ** 2);
}

// Parse CSV into objects
function parseCSV(text) {
  const rows = text.trim().split("\n").map(r => r.split(","));
  const headers = rows.shift().map(h => h.trim().replace(/['"]+/g, ""));
  return rows.map(r => {
    const obj = {};
    r.forEach((val, i) => obj[headers[i]] = val.trim());
    return obj;
  });
}

// Convert objects back to CSV
function toCSV(data) {
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => row[h]).join(","));
  return [headers.join(","), ...rows].join("\n");
}

// Match truth & sensor data
function processData(truthData, sensorData, tolerance) {
  const results = [];

  truthData.forEach(truth => {
    // Build timestamp with ms using time(millisecond)
    const baseTime = new Date(truth["datetime(utc)"]);
    const msOffset = parseInt(truth["time(millisecond)"] || "0", 10);
    const truthTime = baseTime.getTime() + msOffset;

    // Find nearest sensor point within 100ms
    let bestMatch = null;
    let bestDiff = Infinity;

    sensorData.forEach(sensor => {
      const sensorTime = new Date(sensor["Received"]).getTime();
      const diff = Math.abs(sensorTime - truthTime);
      if (diff < 100 && diff < bestDiff) {
        bestMatch = sensor;
        bestDiff = diff;
      }
    });

    if (bestMatch) {
      const truthLat = parseFloat(truth.latitude);
      const truthLon = parseFloat(truth.longitude);
      const truthAlt = parseFloat(truth["altitude_above_seaLevel(meters)"]);

      // Sensor GeoPosition = "POINT(lon lat)"
      const geo = bestMatch.GeoPosition.replace("POINT(", "").replace(")", "").split(" ");
      const sensorLon = parseFloat(geo[0]);
      const sensorLat = parseFloat(geo[1]);
      let sensorAlt = parseFloat(bestMatch.Altitude);

      let dist, type;
      if (!sensorAlt || sensorAlt === 0) {
        dist = haversine(truthLat, truthLon, sensorLat, sensorLon);
        type = "2D";
      } else {
        dist = distance3D(truthLat, truthLon, truthAlt, sensorLat, sensorLon, sensorAlt);
        type = "3D";
      }

      results.push({
        Timestamp: new Date(truthTime).toISOString(),
        "Truth Latitude": truthLat,
        "Truth Longitude": truthLon,
        "Truth Altitude": truthAlt,
        "Sensor Latitude": sensorLat,
        "Sensor Longitude": sensorLon,
        "Sensor Altitude": sensorAlt,
        "Distance between (m)": dist.toFixed(2),
        "Type of measurement": type,
        "Within Tolerance?": dist <= tolerance ? 1 : 0
      });
    }
  });

  return results;
}

// Handle button click
document.getElementById("processBtn").addEventListener("click", async () => {
  const truthFile = document.getElementById("truthFile").files[0];
  const sensorFile = document.getElementById("sensorFile").files[0];
  const tolerance = parseFloat(document.getElementById("tolerance").value);

  if (!truthFile || !sensorFile) {
    alert("Please upload both files.");
    return;
  }

  const truthText = await truthFile.text();
  const sensorText = await sensorFile.text();

  const truthData = parseCSV(truthText);
  const sensorData = parseCSV(sensorText);

  const results = processData(truthData, sensorData, tolerance);

  if (results.length === 0) {
    alert("No matches found.");
    return;
  }

  const csv = toCSV(results);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "comparison_results.csv";
  a.click();

  document.getElementById("status").textContent = `Processed ${results.length} matches. File downloaded.`;
});
