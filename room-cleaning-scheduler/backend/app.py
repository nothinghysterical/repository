from flask import Flask, jsonify
import requests
from datetime import datetime

app = Flask(__name__)

ACCESS_TOKEN = "your-secure-access-token"  # Replace with env var in production

@app.route("/api/room-usage")
def get_room_usage():
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}"
    }
    calendar_id = 46885
    url = f"https://api.planningcenteronline.com/calendar/v2/calendars/{calendar_id}/events?order=-starts_at"

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return jsonify({"error": "Failed to fetch Planning Center data"}), 500

    data = response.json()
    usage = {}
    for event in data["data"]:
        starts_at = event["attributes"]["starts_at"]
        date_str = starts_at[:10]
        room = event["attributes"]["title"]
        days_ago = (datetime.utcnow() - datetime.fromisoformat(date_str)).days
        usage[room] = min(usage.get(room, float("inf")), days_ago)

    return jsonify(usage)

if __name__ == "__main__":
    app.run(port=5000)