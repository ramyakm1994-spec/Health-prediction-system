# Health Prediction System

An AI-powered health prediction application that analyses patient blood test results (Glucose, Haemoglobin, Cholesterol) and generates personalised health risk assessments using the Anthropic Claude AI API.

---

## Features

- **CRUD Operations** — Add, view, edit, and delete patient records
- **AI Health Remarks** — Automatic health risk assessment generated via Claude AI
- **Data Validation** — Email format, future date of birth, numeric blood values
- **Persistent Storage** — SQLite database (auto-created on first run)
- **Responsive UI** — Clean Bootstrap 5 dashboard with colour-coded blood values

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask |
| Frontend | HTML5, Bootstrap 5, Vanilla JS |
| Database | SQLite (built-in, no setup needed) |
| AI/ML API | Anthropic Claude (`claude-haiku-4-5`) |

---

## Prerequisites

- Python 3.8 or higher
- pip

---

## Installation & Setup

### 1. Clone or extract the project

```bash
cd Healthcare
```

### 2. (Optional) Create a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. (Optional) Set the Anthropic API key for full AI remarks

Without this key the app still works — it falls back to a built-in rule-based health assessment engine.

```bash
# macOS / Linux
export ANTHROPIC_API_KEY=your_api_key_here

# Windows (Command Prompt)
set ANTHROPIC_API_KEY=your_api_key_here
```

### 5. Run the application

```bash
python3 app.py
```

### 6. Open in your browser

```
http://127.0.0.1:5000
```

---

## Project Structure

```
Healthcare/
├── app.py                  # Flask backend, REST API, AI integration
├── requirements.txt        # Python dependencies
├── healthcare.db           # SQLite database (auto-created on first run)
├── templates/
│   └── index.html          # Bootstrap 5 frontend
└── static/
    ├── css/
    │   └── style.css       # Custom styles
    └── js/
        └── app.js          # Frontend logic (CRUD, validation, modals)
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/patients` | List all patients |
| GET | `/api/patients/:id` | Get a single patient |
| POST | `/api/patients` | Create patient + generate AI remarks |
| PUT | `/api/patients/:id` | Update patient + regenerate AI remarks |
| DELETE | `/api/patients/:id` | Delete a patient |

---

## Blood Test Reference Ranges

| Test | Low | Normal | High |
|---|---|---|---|
| Glucose (mg/dL) | < 70 | 70 – 100 | > 100 |
| Haemoglobin (g/dL) | < 12.0 | 12.0 – 17.5 | > 17.5 |
| Cholesterol (mg/dL) | — | < 200 | ≥ 200 |
