import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from flask import send_file

# Folder to store uploaded PDFs
PAPER_DIR = "papers"
os.makedirs(PAPER_DIR, exist_ok=True)


app = Flask(__name__)
CORS(app,
     resources={r"/*": {"origins": "http://127.0.0.1:5500"}},
     supports_credentials=True)

DB = "exam.db"

# --------------------------------------------------------
# Initialize DB with correct tables
# --------------------------------------------------------
def init_db():
    con = sqlite3.connect(DB)
    cur = con.cursor()

    # Table for exams
    cur.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        exam_id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_name TEXT NOT NULL,
        session TEXT NOT NULL,
        exam_time TEXT NOT NULL,
        total_marks INTEGER NOT NULL
    )
    """)

    # Table for subjects of each class
    cur.execute("""
    CREATE TABLE IF NOT EXISTS exam_subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session TEXT NOT NULL,
        class_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        UNIQUE(session, class_name, subject)
    )
    """)

    # Table for exam schedule (datesheet)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS datesheet (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        subject TEXT NOT NULL,
        total_marks INTEGER NOT NULL,
        date TEXT NOT NULL,
        duration INTEGER NOT NULL,
        session TEXT NOT NULL
    )
    """)

    # Table for storing marks
    cur.execute("""
    CREATE TABLE IF NOT EXISTS exam_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    exam_id INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    roll TEXT NOT NULL,
    marks INTEGER NOT NULL,
    UNIQUE(session, exam_id, class_name, subject, roll)
    )
    """)

    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS class_incharge (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session TEXT NOT NULL,
            class_name TEXT NOT NULL,
            incharge TEXT NOT NULL,
            UNIQUE(session, class_name)
        )
    """)
    
            # Table for teachers (session wise)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(session, username)
    )
    """)

    # Table for storing teacher timetable
    cur.execute("""
   CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session TEXT NOT NULL,
    teacher_id INTEGER NOT NULL,
    period INTEGER NOT NULL,
    class TEXT,
    monday TEXT,
    tuesday TEXT,
    wednesday TEXT,
    thursday TEXT,
    friday TEXT,
    saturday TEXT,
    startDay INTEGER DEFAULT 1,
    endDay INTEGER DEFAULT 1,
    UNIQUE(session, teacher_id, period)
)
""")
    

    con.commit()
    con.close()

init_db()

# --------------------------------------------------------
# Create exam
# --------------------------------------------------------
@app.route("/exam/create", methods=["POST"])
def create_exam():
    data = request.json
    exam_name = data.get("exam_name")
    session = data.get("session")
    exam_time = data.get("exam_time")
    total_marks = data.get("total_marks")

    if not exam_name or not session or not exam_time or not total_marks:
        return jsonify({"success": False, "message": "Missing fields"})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("""
            INSERT INTO exams (exam_name, session, exam_time, total_marks)
            VALUES (?, ?, ?, ?)
        """, (exam_name, session, exam_time, total_marks))
        con.commit()
        exam_id = cur.lastrowid
        con.close()
        return jsonify({"success": True, "exam_id": exam_id})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# --------------------------------------------------------
# Delete an exam completely
# --------------------------------------------------------
@app.route("/exam/delete/<int:exam_id>", methods=["DELETE"])
def delete_exam(exam_id):
    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()

        # 1️⃣ Check exam exists
        cur.execute("SELECT exam_name, session FROM exams WHERE exam_id=?", (exam_id,))
        row = cur.fetchone()

        if not row:
            return jsonify({"success": False, "message": "Exam not found"})

        exam_name, session = row

        # 2️⃣ Delete from exams table
        cur.execute("DELETE FROM exams WHERE exam_id=?", (exam_id,))

        # 3️⃣ Delete datesheet entries
        cur.execute("DELETE FROM datesheet WHERE exam_name=? AND session=?", (exam_name, session))

        con.commit()
        con.close()

        # 4️⃣ Delete uploaded papers folder (if exists)
        folder_path = os.path.join(PAPER_DIR, session, exam_name)
        if os.path.exists(folder_path):
            import shutil
            shutil.rmtree(folder_path)

        return jsonify({"success": True, "message": "Exam deleted successfully"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


# --------------------------------------------------------
# List all exams
# --------------------------------------------------------
@app.route("/exam/list-all")
def list_all_exams():
    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("SELECT exam_id, exam_name, session, exam_time, total_marks FROM exams")
        exams = [{"exam_id": r[0], "exam_name": r[1], "session": r[2], "exam_time": r[3], "total_marks": r[4]} for r in cur.fetchall()]
        con.close()
        return jsonify({"success": True, "exams": exams})
    except Exception as e:
        return jsonify({"success": False, "message": str(e), "exams": []})

# --------------------------------------------------------
# Add subjects for a class
# --------------------------------------------------------
@app.route("/exam/subjects/add", methods=["POST"])
def add_subjects():
    data = request.json
    session = data.get("session")
    class_name = data.get("class_name")
    subjects = data.get("subjects", [])

    if not session or not class_name or not subjects:
        return jsonify({"success": False, "message": "Missing fields"})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("DELETE FROM exam_subjects WHERE session=? AND class_name=?", (session, class_name))
        for s in subjects:
            cur.execute("INSERT INTO exam_subjects (session, class_name, subject) VALUES (?, ?, ?)",
                        (session, class_name, s))
        con.commit()
        con.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# --------------------------------------------------------
# Get subjects for a class
# --------------------------------------------------------
@app.route("/exam/subjects/get")
def get_subjects():
    session = request.args.get("session")
    class_name = request.args.get("class_name")
    if not session or not class_name:
        return jsonify({"success": False, "message": "Missing parameters", "subjects": []})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("SELECT subject FROM exam_subjects WHERE session=? AND class_name=?", (session, class_name))
        subjects = [r[0] for r in cur.fetchall()]
        con.close()
        return jsonify({"success": True, "subjects": subjects})
    except Exception as e:
        return jsonify({"success": False, "message": str(e), "subjects": []})

# --------------------------------------------------------
# Add exam schedule (full datesheet)
# --------------------------------------------------------
@app.route("/exam/add-datesheet", methods=["POST"])
def add_datesheet():
    data = request.get_json()
    session = data.get("session")
    class_name = data.get("class_name")
    exam_name = data.get("exam_name")
    datesheet = data.get("datesheet", [])

    if not session or not class_name or not exam_name or not datesheet:
        return jsonify(success=False, message="Missing data"), 400

    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # Delete existing datesheet for same session/class/exam
    cur.execute("DELETE FROM datesheet WHERE session=? AND class_name=? AND exam_name=?",
                (session, class_name, exam_name))

    # Insert new datesheet
    for item in datesheet:
        cur.execute("""INSERT INTO datesheet (session, class_name, exam_name, subject, date, total_marks, duration)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (session, class_name, exam_name, item["subject"], item["date"], item["total_marks"], item["duration"]))

    conn.commit()
    conn.close()

    return jsonify(success=True, message="Datesheet saved")

# --------------------------------------------------------
# Get datesheet for a class/exam/session
# --------------------------------------------------------
@app.route("/exam/get-datesheet", methods=["GET"])
def get_datesheet():
    class_name = request.args.get("class_name")
    session = request.args.get("session")
    exam_name = request.args.get("exam_name")

    if not class_name or not session or not exam_name:
        return jsonify(success=False, message="Missing parameters"), 400

    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    # 1️⃣ Get all subjects for class + session
    cur.execute("""
        SELECT subject FROM exam_subjects
        WHERE class_name=? AND session=?
    """, (class_name, session))
    subjects = [row[0] for row in cur.fetchall()]

    # 2️⃣ Get datesheet (subjects + dates)
    cur.execute("""
        SELECT subject, date FROM datesheet
        WHERE class_name=? AND session=? AND exam_name=?
    """, (class_name, session, exam_name))
    date_rows = cur.fetchall()

    conn.close()

    # Convert datesheet into dictionary
    date_map = {sub: dt for sub, dt in date_rows}

    # 3️⃣ Prepare output: return ALL subjects (even if some dates missing)
    final = []
    for sub in subjects:
        final.append({
            "subject": sub,
            "date": date_map.get(sub, "")
        })

    return jsonify(success=True, datesheet=final)

@app.route("/debug/datesheet")
def debug_datesheet():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(datesheet)")
    cols = cur.fetchall()
    conn.close()
    return {"columns": cols}

@app.route("/exam/upload-paper", methods=["POST"])
def upload_paper():
    session = request.form.get("session")
    class_name = request.form.get("class_name")
    exam_name = request.form.get("exam_name")
    subject = request.form.get("subject")
    file = request.files.get("pdf")

    if not all([session, class_name, exam_name, subject, file]):
        return jsonify({"success": False, "message": "Missing data"})

    try:
        # create folder structure
        folder = os.path.join(PAPER_DIR, session, exam_name, class_name)
        os.makedirs(folder, exist_ok=True)

        # Save file
        filepath = os.path.join(folder, f"{subject}.pdf")
        file.save(filepath)

        return jsonify({"success": True, "message": "Paper uploaded successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# --------------------------------------------------------
# DELETE uploaded exam paper
# --------------------------------------------------------
@app.route("/exam/delete-paper", methods=["DELETE"])
def delete_paper():
    data = request.get_json()
    session = data.get("session")
    class_name = data.get("class_name")
    exam_name = data.get("exam_name")
    subject = data.get("subject")

    if not all([session, class_name, exam_name, subject]):
        return jsonify({"success": False, "message": "Missing parameters"}), 400

    try:
        filepath = os.path.join(PAPER_DIR, session, exam_name, class_name, f"{subject}.pdf")
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({"success": True, "message": "Paper deleted successfully"})
        else:
            return jsonify({"success": False, "message": "Paper not found"}), 404
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# -----------------------
# 4️⃣ Get/View PDF
# -----------------------
@app.route("/exam/get-paper")
def get_paper():
    session = request.args.get("session")
    class_name = request.args.get("class_name")
    exam_name = request.args.get("exam_name")
    subject = request.args.get("subject")

    if not all([session, class_name, exam_name, subject]):
        return "Missing parameters", 400

    filepath = os.path.join(PAPER_DIR, session, exam_name, class_name, f"{subject}.pdf")
    if os.path.exists(filepath):
        return send_file(filepath)
    else:
        return "Paper not found", 404
    
@app.route("/incharge/set", methods=["POST"])
def set_incharge():
    data = request.json
    session = data.get("session")
    class_name = data.get("class_name")
    incharge = data.get("incharge")

    if not session or not class_name or not incharge:
        return jsonify({"success": False, "message": "Missing fields"})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()

        cur.execute("""
            INSERT INTO class_incharge (session, class_name, incharge)
            VALUES (?, ?, ?)
            ON CONFLICT(session, class_name)
            DO UPDATE SET incharge=excluded.incharge
        """, (session, class_name, incharge))

        con.commit()
        con.close()
        return jsonify({"success": True, "message": "Incharge saved"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/incharge/get", methods=["GET"])
def get_incharge():
    session = request.args.get("session")
    if not session:
        return jsonify({"success": False, "message": "Missing session"})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("SELECT class_name, incharge FROM class_incharge WHERE session=?", (session,))
        rows = cur.fetchall()
        con.close()

        data = {cls: name for cls, name in rows}

        return jsonify({"success": True, "incharge": data})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# --------------------------------------------------------
# Add marks for students
# --------------------------------------------------------
@app.route("/exam/add-marks", methods=["POST"])
def add_marks():
    data = request.get_json()
    session = data.get("session")
    class_name = data.get("class_name")
    exam_name = data.get("exam_name")
    marks_list = data.get("marks", [])  # List of dicts: {"roll": "...", "subject": "...", "marks": ...}

    if not session or not class_name or not exam_name or not marks_list:
        return jsonify({"success": False, "message": "Missing data"}), 400

    try:
        conn = sqlite3.connect(DB)
        cur = conn.cursor()

        # Get exam_id
        cur.execute("SELECT exam_id FROM exams WHERE exam_name=? AND session=? LIMIT 1", (exam_name, session))
        row = cur.fetchone()
        if not row:
            return jsonify({"success": False, "message": "Exam not found"}), 404
        exam_id = row[0]

        # Insert or update marks
        for item in marks_list:
            roll = item.get("roll")
            subject = item.get("subject")
            marks_value = item.get("marks")
            if roll and subject and marks_value is not None:
                # Upsert marks
                cur.execute("""
                    INSERT INTO exam_marks (session, exam_id, class_name, subject, roll, marks)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session, exam_id, class_name, subject, roll)
                    DO UPDATE SET marks=excluded.marks
                """, (session, exam_id, class_name, subject, roll, marks_value))

        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Marks added/updated successfully"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/exam/get-marks")
def get_marks():
    session = request.args.get("session")
    class_name = request.args.get("class_name")
    exam_name = request.args.get("exam_name")

    if not session or not class_name or not exam_name:
        return jsonify({"success": False, "message": "Missing parameters"}), 400

    try:
        conn = sqlite3.connect(DB)
        cur = conn.cursor()

        # get exam_id
        cur.execute("SELECT exam_id FROM exams WHERE exam_name=? AND session=? LIMIT 1", (exam_name, session))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "message": "Exam not found"}), 404
        exam_id = row[0]

        # fetch marks from exam_marks (use roll as key)
        cur.execute("""
            SELECT roll, subject, marks
            FROM exam_marks
            WHERE session=? AND class_name=? AND exam_id=?
        """, (session, class_name, exam_id))

        rows = cur.fetchall()
        conn.close()

        marks = []
        for roll, subject, marks_value in rows:
            marks.append({
                "student_id": roll,   # use roll as temporary id
                "roll": roll,
                "subject": subject,
                "marks": marks_value
            })

        return jsonify({"success": True, "marks": marks})
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"success": False, "message": str(e)}), 500

# --------------------------------------------------------
# Get exam details by session + exam name
# --------------------------------------------------------
@app.route("/exam/get/<session>/<path:exam_name>")
def get_exam_details(session, exam_name):
    try:
        exam_name = exam_name.replace("%20", " ")

        con = sqlite3.connect(DB)
        cur = con.cursor()

        cur.execute("""
            SELECT exam_id, exam_name, session, exam_time, total_marks
            FROM exams
            WHERE session=? AND exam_name=?
        """, (session, exam_name))

        row = cur.fetchone()
        con.close()

        if not row:
            return jsonify({"success": False, "message": "Exam not found"})

        exam = {
            "exam_id": row[0],
            "exam_name": row[1],
            "session": row[2],
            "exam_time": row[3],
            "total_marks": row[4]
        }

        return jsonify({"success": True, "exam": exam})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/teacher/add", methods=["POST"])
def add_teacher():
    data = request.json
    session = data.get("session")
    username = data.get("username")
    password = data.get("password")
    name = data.get("name")

    if not session or not username or not password or not name:
        return jsonify({"success": False, "message": "Missing fields"})

    try:
        con = sqlite3.connect(DB)
        cur = con.cursor()
        cur.execute("""
            INSERT INTO teachers (session, username, password, name)
            VALUES (?, ?, ?, ?)
        """, (session, username, password, name))
        con.commit()
        con.close()
        return jsonify({"success": True, "message": "Teacher added"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route("/teacher/list")
def list_teachers():
    session = request.args.get("session")
    if not session:
        return jsonify({"success": False, "message": "Missing session"})

    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT id, username, name FROM teachers WHERE session=?", (session,))
    rows = cur.fetchall()
    con.close()

    teachers = [{"id": r[0], "username": r[1], "name": r[2]} for r in rows]
    return jsonify({"success": True, "teachers": teachers})

@app.route("/teacher/delete/<int:teacher_id>", methods=["DELETE"])
def delete_teacher(teacher_id):
    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("DELETE FROM teachers WHERE id=?", (teacher_id,))
    con.commit()
    con.close()
    return jsonify({"success": True, "message": "Teacher deleted"})

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"success": False, "message": "Missing login details"}), 400

    con = sqlite3.connect(DB)
    cur = con.cursor()

    # -------- ADMIN LOGIN --------
    if username == "admin" and password == "admin":
        con.close()
        return jsonify({
            "success": True,
            "role": "admin",
            "token": "admin_token"
        })

    # -------- TEACHER LOGIN --------
    cur.execute("SELECT id, name, session FROM teachers WHERE username=? AND password=?", 
                (username, password))
    row = cur.fetchone()
    if row:
        teacher_id, teacher_name, session = row
        con.close()
        return jsonify({
            "success": True,
            "role": "teacher",
            "token": f"teacher_{username}_token",
            "teacher": {
                "id": teacher_id,
                "name": teacher_name,
                "username": username,
                "session": session
            }
        })

    # -------- STUDENT LOGIN (Roll + DOB) --------
    # You can connect this to your existing student DB, for now we return handle manually.
    # If not using, remove this block.

    con.close()
    return jsonify({"success": False, "message": "Invalid username or password"})

# -------------------------------
# Get timetable for a teacher
# -------------------------------
# ------------------------------------------
# GET TIMETABLE FOR A TEACHER
# ------------------------------------------
@app.route("/timetable/get")
def get_timetable():
    session = request.args.get("session")
    teacher_id = request.args.get("teacher_id")

    if not session or not teacher_id:
        return jsonify({
            "success": False,
            "message": "Missing parameters",
            "timetable": []
        }), 400

    con = sqlite3.connect(DB)
    cur = con.cursor()

    # Ensure startDay and endDay columns exist
    cur.execute("PRAGMA table_info(timetable)")
    columns = [col[1] for col in cur.fetchall()]
    if "startDay" not in columns:
        cur.execute("ALTER TABLE timetable ADD COLUMN startDay INTEGER DEFAULT 1")
    if "endDay" not in columns:
        cur.execute("ALTER TABLE timetable ADD COLUMN endDay INTEGER DEFAULT 1")
    con.commit()

    cur.execute("""
        SELECT period, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, class, startDay, endDay
        FROM timetable
        WHERE session = ? AND teacher_id = ?
        ORDER BY period ASC
    """, (session, teacher_id))

    rows = cur.fetchall()
    con.close()

    timetable = []
    for r in rows:
        timetable.append({
            "period": r[0],
            "Monday": r[1],
            "Tuesday": r[2],
            "Wednesday": r[3],
            "Thursday": r[4],
            "Friday": r[5],
            "Saturday": r[6],
            "class": r[7],
            "startDay": r[8] or 1,
            "endDay": r[9] or 1
        })

    return jsonify({"success": True, "timetable": timetable})


# ------------------------------------------
# SAVE TIMETABLE FOR A TEACHER
# ------------------------------------------
@app.route("/timetable/set", methods=["POST"])
def set_timetable():
    data = request.get_json()
    session = data.get("session")
    teacher_id = data.get("teacher_id")
    timetable = data.get("timetable", [])

    if not session or not teacher_id or not timetable:
        return jsonify({"success": False, "message": "Missing data"}), 400

    con = sqlite3.connect(DB)
    cur = con.cursor()

    # Ensure required columns exist
    cur.execute("PRAGMA table_info(timetable)")
    columns = [col[1] for col in cur.fetchall()]
    required_cols = ["saturday", "class", "startDay", "endDay"]
    for col in required_cols:
        if col not in columns:
            if col in ["startDay", "endDay"]:
                cur.execute(f"ALTER TABLE timetable ADD COLUMN {col} INTEGER DEFAULT 1")
            else:
                cur.execute(f"ALTER TABLE timetable ADD COLUMN {col} TEXT")
    con.commit()

    # Delete old entries for this teacher
    cur.execute("DELETE FROM timetable WHERE session=? AND teacher_id=?", (session, teacher_id))

    # Insert new timetable with conflict check
    for i, period in enumerate(timetable, start=1):
        class_name = period.get("class", "")
        start_day = period.get("startDay", 1)
        end_day = period.get("endDay", 1)

        # Skip empty entries
        if not class_name:
            continue

        # Check for conflicts: same class, same period, overlapping days
        cur.execute("""
            SELECT COUNT(*) FROM timetable
            WHERE session=? AND class=? AND period=? 
              AND NOT (endDay < ? OR startDay > ?)
        """, (session, class_name, i, start_day, end_day))
        if cur.fetchone()[0] > 0:
            con.close()
            return jsonify({
                "success": False,
                "message": f"Conflict detected for class {class_name}, period {i}, days {start_day}-{end_day}"
            }), 400

        # Insert period
        cur.execute("""
            INSERT INTO timetable (session, teacher_id, period, class,
                                   monday, tuesday, wednesday, thursday, friday, saturday,
                                   startDay, endDay)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session, teacher_id, i,
            class_name,
            period.get("Monday", ""),
            period.get("Tuesday", ""),
            period.get("Wednesday", ""),
            period.get("Thursday", ""),
            period.get("Friday", ""),
            period.get("Saturday", ""),
            start_day,
            end_day
        ))

    con.commit()
    con.close()
    return jsonify({"success": True, "message": "Timetable saved successfully"})


# ------------------------------------------
# CLASSWISE TIMETABLE
# ------------------------------------------
@app.route("/timetable/classwise")
def timetable_classwise():
    session = request.args.get("session")
    class_name = request.args.get("class_name")

    if not session or not class_name:
        return jsonify({"success": False, "message": "Missing parameters", "timetable": []})

    con = sqlite3.connect(DB)
    cur = con.cursor()

    # Ensure columns exist
    cur.execute("PRAGMA table_info(timetable)")
    columns = [col[1] for col in cur.fetchall()]
    for col in ["saturday", "startDay", "endDay"]:
        if col not in columns:
            if col in ["startDay", "endDay"]:
                cur.execute(f"ALTER TABLE timetable ADD COLUMN {col} INTEGER DEFAULT 1")
            else:
                cur.execute(f"ALTER TABLE timetable ADD COLUMN {col} TEXT")
    con.commit()

    # Fetch timetable for class
    cur.execute("""
        SELECT period, class, monday, tuesday, wednesday, thursday, friday, saturday, teacher_id, startDay, endDay
        FROM timetable
        WHERE session=? AND class=?
        ORDER BY period ASC
    """, (session, class_name))

    rows = cur.fetchall()
    timetable = []

    for r in rows:
        cur.execute("SELECT name FROM teachers WHERE id=?", (r[8],))
        teacher_name = (cur.fetchone() or [""])[0]

        timetable.append({
            "period": r[0],
            "class": r[1],
            "Monday": f"{teacher_name} - {r[2]}" if r[2] else "",
            "Tuesday": f"{teacher_name} - {r[3]}" if r[3] else "",
            "Wednesday": f"{teacher_name} - {r[4]}" if r[4] else "",
            "Thursday": f"{teacher_name} - {r[5]}" if r[5] else "",
            "Friday": f"{teacher_name} - {r[6]}" if r[6] else "",
            "Saturday": f"{teacher_name} - {r[7]}" if r[7] else "",
            "startDay": r[9] or 1,
            "endDay": r[10] or 1
        })

    con.close()
    return jsonify({"success": True, "timetable": timetable})
# --------------------------------------------------------
# Run app
# --------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True)
