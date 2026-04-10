from flask import Flask, render_template, request, jsonify, session
import sqlite3
import google.generativeai as genai
from functools import wraps
from datetime import date
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-me-in-production")

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set. Add it to your environment variables.")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

DB = "taskmind.db"

BASE_SYS = """You are TaskMind, a friendly AI task planner.

Your job is to turn user goals into structured, prioritised task plans through brief natural conversation.

CONVERSATION FLOW:
- For a very simple single-step task: go straight to task JSON.
<<<<<<< HEAD
- For multi-part, ambiguous, or broad goals: ask as many follow-up questions as needed to get all the informationfirst.
- After the user answers all questions, return task JSON.
- If the user wants to change, refine, remove, reprioritize, or edit EXISTING tasks, do NOT regenerate everything.
  Return an update JSON with only the needed operations.
- Do not ask more than one follow-up question.

PRIORITY RULES:
- high: urgent, user explicitly says urgent/ASAP, or deadline within 3 days
- medium: important but not urgent, flexible timeline, or deadline around 1-2 weeks
- low: nice-to-have, background, no real deadline
- Do NOT mark everything high priority.
- Most plans should have a mix of priorities.

DATE RULES:
- Today is __TODAY__.
- If the user gives a day or weekday, resolve it to an exact ISO date YYYY-MM-DD.
- If the user gives a relative date like tomorrow / next Monday / in 3 days, calculate the exact ISO date.
- Only include dueDate if the user clearly gave a date/day/deadline.
- Never invent exact dates.
- Use ISO format YYYY-MM-DD in every dueDate.

Return ONLY valid JSON.

TASK JSON:
{
  "type": "tasks",
  "reply": "One warm sentence.",
  "tasks": [
    {
      "title": "Task title",
      "priority": "high|medium|low",
      "dueDate": null,
      "subtasks": ["step 1", "step 2", "step 3"]
    }
  ]
}

QUESTION JSON:
{"type":"question","reply":"One short follow-up question"}

UPDATE JSON:
{
  "type":"update",
  "reply":"One short sentence.",
  "operations":[
    {
      "action":"edit|delete|complete|reopen|add",
      "target":"Existing task title",
      "fields":{
        "title":"Updated title if needed",
        "priority":"high|medium|low",
        "dueDate":"YYYY-MM-DD or null",
        "subtasks":["updated","subtasks"]
      }
    }
  ]
}

CHAT JSON:
{"type":"chat","reply":"Brief reply"}
"""

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    conn.commit()

    # Optional migration for older databases missing the password column constraints.
    cols = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "username" not in cols or "password" not in cols:
        raise RuntimeError("Users table schema is invalid. Please recreate taskmind.db.")


    conn.close()

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401

        return fn(*args, **kwargs)
    return wrapper

@app.route("/")
def home():
    if "user_id" in session:
        return render_template("app.html", username=session.get("username", "User"))
    return render_template("login.html")

@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json(force=True)
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()
        if not username or not password:
            return jsonify({"error": "Enter both username and password"}), 400

        hashed_password = generate_password_hash(password)

        conn = get_db()
        try:
            conn.execute(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                (username, hashed_password)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Username already exists"}), 400

        user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        conn.close()

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json(force=True)
        username = (data.get("username") or "").strip()
        password = (data.get("password") or "").strip()
        conn = get_db()
        user = conn.execute(
            "SELECT * FROM users WHERE username=?",
            (username,)
        ).fetchone()
        conn.close()

        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "Invalid login"}), 400

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})
    return jsonify({"ok":True})

@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    try:
        data = request.get_json(force=True)
        history = data.get("history", [])
        current_tasks = data.get("currentTasks", [])

        sys_prompt = BASE_SYS.replace("__TODAY__", date.today().isoformat())
        prompt = (
            sys_prompt
            + "\n\nCURRENT TASKS JSON:\n"
            + json.dumps(current_tasks, ensure_ascii=False)
            + "\n\nCONVERSATION:\n"
        )

        for msg in history[-6:]:
            role = msg.get("role", "user")
            content = str(msg.get("content", ""))
            prompt += f"{role}: {content}\n"

        response = model.generate_content(prompt)
        return jsonify({"reply": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
