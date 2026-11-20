from flask import Flask, jsonify
from flask_cors import CORS
from routes.team3_routes import team3_bp

# Teammates 1 & 2 will import and register their blueprints here later:
# from routes.team1_routes import team1_bp
# from routes.team2_routes import team2_bp

app = Flask(__name__)
CORS(app)  # Allows frontend (Live Server / localhost) to call Flask APIs

# Register Blueprints
app.register_blueprint(team3_bp, url_prefix="/api/v1")


@app.route("/api/v1/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "BuildTrack Flask API"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)