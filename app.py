import os
import sqlite3
import json
from datetime import date, datetime
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import anthropic

app = Flask(__name__)
CORS(app)

DB_PATH = "healthcare.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                date_of_birth TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                glucose REAL NOT NULL,
                haemoglobin REAL NOT NULL,
                cholesterol REAL NOT NULL,
                remarks TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()


def get_ai_prediction(full_name, dob, glucose, haemoglobin, cholesterol):
    """Call Anthropic Claude API to generate health prediction remarks."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return generate_rule_based_prediction(glucose, haemoglobin, cholesterol)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        today = date.today()
        birth = datetime.strptime(dob, "%Y-%m-%d").date()
        age = (today - birth).days // 365

        prompt = f"""You are a medical AI assistant. Based on the following patient blood test results,
provide a concise health assessment (2-3 sentences max). Identify any potential health risks or conditions
and give brief recommendations. Do not provide a diagnosis, only a risk assessment.

Patient: {full_name}, Age: {age}
Blood Test Results:
- Glucose: {glucose} mg/dL (Normal fasting: 70-100 mg/dL)
- Haemoglobin: {haemoglobin} g/dL (Normal: 13.5-17.5 for males, 12.0-15.5 for females)
- Cholesterol: {cholesterol} mg/dL (Desirable: <200 mg/dL, Borderline: 200-239, High: ≥240)

Provide a brief health risk assessment and recommendation."""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()
    except Exception as e:
        return generate_rule_based_prediction(glucose, haemoglobin, cholesterol)


def generate_rule_based_prediction(glucose, haemoglobin, cholesterol):
    """Fallback rule-based health assessment when API is unavailable."""
    issues = []
    recommendations = []

    if glucose < 70:
        issues.append("low blood glucose (hypoglycemia risk)")
        recommendations.append("increase carbohydrate intake and consult a physician")
    elif 100 < glucose <= 125:
        issues.append("elevated glucose indicating pre-diabetes risk")
        recommendations.append("adopt a low-sugar diet and increase physical activity")
    elif glucose > 125:
        issues.append("high blood glucose strongly indicating diabetes risk")
        recommendations.append("seek immediate medical attention for diabetes screening")

    if haemoglobin < 12.0:
        issues.append("low haemoglobin indicating anaemia")
        recommendations.append("increase iron-rich foods and consider iron supplementation")
    elif haemoglobin > 17.5:
        issues.append("elevated haemoglobin which may indicate dehydration or polycythaemia")
        recommendations.append("stay well hydrated and consult a physician")

    if 200 <= cholesterol < 240:
        issues.append("borderline high cholesterol")
        recommendations.append("reduce saturated fat intake and exercise regularly")
    elif cholesterol >= 240:
        issues.append("high cholesterol increasing cardiovascular risk")
        recommendations.append("consult a physician for cholesterol management and possible medication")

    if not issues:
        return ("All blood test values are within normal ranges. Patient appears to be in good health. "
                "Recommend maintaining a balanced diet and regular exercise routine.")

    issues_str = ", ".join(issues)
    rec_str = "; ".join(recommendations)
    return (f"Results indicate {issues_str}. "
            f"Recommendations: {rec_str}. Please consult a healthcare professional for a full evaluation.")


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/patients", methods=["GET"])
def get_patients():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM patients ORDER BY created_at DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/patients/<int:pid>", methods=["GET"])
def get_patient(pid):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    if not row:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(dict(row))


@app.route("/api/patients", methods=["POST"])
def create_patient():
    data = request.get_json()
    err = validate_patient(data)
    if err:
        return jsonify({"error": err}), 400

    remarks = get_ai_prediction(
        data["full_name"], data["date_of_birth"],
        float(data["glucose"]), float(data["haemoglobin"]), float(data["cholesterol"])
    )

    try:
        with get_db() as conn:
            cur = conn.execute(
                """INSERT INTO patients (full_name, date_of_birth, email, glucose, haemoglobin, cholesterol, remarks)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (data["full_name"], data["date_of_birth"], data["email"],
                 float(data["glucose"]), float(data["haemoglobin"]), float(data["cholesterol"]), remarks)
            )
            conn.commit()
            pid = cur.lastrowid
        row = get_db().execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
        return jsonify(dict(row)), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email address already exists"}), 409


@app.route("/api/patients/<int:pid>", methods=["PUT"])
def update_patient(pid):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
    if not existing:
        return jsonify({"error": "Patient not found"}), 404

    data = request.get_json()
    err = validate_patient(data, existing_id=pid)
    if err:
        return jsonify({"error": err}), 400

    remarks = get_ai_prediction(
        data["full_name"], data["date_of_birth"],
        float(data["glucose"]), float(data["haemoglobin"]), float(data["cholesterol"])
    )

    try:
        with get_db() as conn:
            conn.execute(
                """UPDATE patients SET full_name=?, date_of_birth=?, email=?, glucose=?,
                   haemoglobin=?, cholesterol=?, remarks=?, updated_at=datetime('now')
                   WHERE id=?""",
                (data["full_name"], data["date_of_birth"], data["email"],
                 float(data["glucose"]), float(data["haemoglobin"]), float(data["cholesterol"]),
                 remarks, pid)
            )
            conn.commit()
        row = get_db().execute("SELECT * FROM patients WHERE id = ?", (pid,)).fetchone()
        return jsonify(dict(row))
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email address already exists"}), 409


@app.route("/api/patients/<int:pid>", methods=["DELETE"])
def delete_patient(pid):
    with get_db() as conn:
        row = conn.execute("SELECT id FROM patients WHERE id = ?", (pid,)).fetchone()
        if not row:
            return jsonify({"error": "Patient not found"}), 404
        conn.execute("DELETE FROM patients WHERE id = ?", (pid,))
        conn.commit()
    return jsonify({"message": "Patient deleted successfully"})


# ── Validation ───────────────────────────────────────────────────────────────

def validate_patient(data, existing_id=None):
    required = ["full_name", "date_of_birth", "email", "glucose", "haemoglobin", "cholesterol"]
    for field in required:
        if not data.get(field, ""):
            return f"Field '{field}' is required"

    import re
    email_re = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    if not email_re.match(str(data["email"])):
        return "Invalid email address format"

    try:
        dob = datetime.strptime(str(data["date_of_birth"]), "%Y-%m-%d").date()
        if dob >= date.today():
            return "Date of birth cannot be today or a future date"
    except ValueError:
        return "Invalid date of birth format (expected YYYY-MM-DD)"

    for field in ["glucose", "haemoglobin", "cholesterol"]:
        try:
            val = float(data[field])
            if val <= 0:
                return f"{field.capitalize()} must be a positive number"
        except (ValueError, TypeError):
            return f"{field.capitalize()} must be a numeric value"

    return None


if __name__ == "__main__":
    init_db()
    print("Health Prediction App running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
