"""
Fill the syllabus template.docx with course data from the Course Builder.
Template placeholders: Course_name, Credits, l_t_p, tot_hours, c_obj1-4,
Module1-5, m1_hours-m5_hours, CO1-4, Textbook1-3, Reference1-3, labs.
Optional: logo_path to embed a logo at the top of the document.
"""
import os
from io import BytesIO
from docx import Document
from docx.shared import Inches
from typing import Dict, Any, Optional


TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "uploads", "template.docx")


def _replace_in_paragraph(paragraph, replacements: Dict[str, str]) -> None:
    """Replace placeholders in a paragraph (all runs). Handles placeholders split across runs."""
    full_text = paragraph.text
    if not full_text or "{{" not in full_text:
        return
    for key, value in replacements.items():
        full_text = full_text.replace("{{" + key + "}}", str(value or ""))
    if "{{" in full_text:
        return  # leave unchanged if not all replaced
    # Clear and set new text (keeps one run style)
    for run in paragraph.runs:
        run.text = ""
    if paragraph.runs:
        paragraph.runs[0].text = full_text
    else:
        paragraph.add_run(full_text)


def _replace_in_document(doc: Document, replacements: Dict[str, str]) -> None:
    for paragraph in doc.paragraphs:
        _replace_in_paragraph(paragraph, replacements)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    _replace_in_paragraph(paragraph, replacements)


def _compute_tot_hours(data: Dict[str, Any]) -> str:
    """Sum hours from weekly_breakdown daily_plan."""
    total = 0
    for week in data.get("weekly_breakdown") or []:
        for day in week.get("daily_plan") or []:
            h = day.get("hours")
            if isinstance(h, (int, float)):
                total += int(h)
    return str(total) if total else data.get("duration", "—")


def _module_hours(week_data: Dict[str, Any]) -> str:
    """Sum hours for one week's daily_plan."""
    total = 0
    for day in week_data.get("daily_plan") or []:
        h = day.get("hours")
        if isinstance(h, (int, float)):
            total += int(h)
    return str(total)


def _module_title(week_data: Dict[str, Any]) -> str:
    """Module title from week theme and main topics."""
    theme = week_data.get("theme") or ""
    objs = week_data.get("learning_objectives") or []
    if objs:
        return f"{theme}: {objs[0]}" if theme else objs[0]
    return theme or "—"


def _course_outcomes(data: Dict[str, Any]) -> list:
    """First 4 course outcomes from course_goals or aggregated learning objectives."""
    goals = data.get("course_goals") or []
    if len(goals) >= 4:
        return goals[:4]
    # Else collect from weekly learning_objectives
    outcomes = list(goals)
    for week in data.get("weekly_breakdown") or []:
        for obj in week.get("learning_objectives") or []:
            if obj and obj not in outcomes:
                outcomes.append(obj)
            if len(outcomes) >= 4:
                return outcomes[:4]
    while len(outcomes) < 4:
        outcomes.append("—")
    return outcomes[:4]


def _labs_list(data: Dict[str, Any]) -> str:
    """Single string of lab descriptions from weekly daily_plan."""
    labs = []
    for week in data.get("weekly_breakdown") or []:
        for day in week.get("daily_plan") or []:
            lab = day.get("lab")
            if lab:
                labs.append(lab)
    return "; ".join(labs) if labs else "—"


def build_replacements(data: Dict[str, Any]) -> Dict[str, str]:
    """Build placeholder -> value map from course builder result."""
    weeks = data.get("weekly_breakdown") or []
    tools = data.get("tools_and_technologies") or {}
    resources = data.get("recommended_resources") or {}
    books = resources.get("books") or []
    cred = getattr(data, "credits", None) or data.get("credits")
    ltp = getattr(data, "ltp", None) or data.get("ltp")

    replacements = {
        "Course_name": data.get("course_title", "—"),
        "Credits": cred if cred is not None else "—",
        "l_t_p": ltp if ltp is not None else "—",
        "tot_hours": _compute_tot_hours(data),
        "c_obj1": (data.get("course_goals") or [""])[0] if (data.get("course_goals")) else "—",
        "c_obj2": (data.get("course_goals") or ["", ""])[1] if len(data.get("course_goals") or []) > 1 else "—",
        "c_obj3": (data.get("course_goals") or ["", "", ""])[2] if len(data.get("course_goals") or []) > 2 else "—",
        "c_obj4": (data.get("course_goals") or ["", "", "", ""])[3] if len(data.get("course_goals") or []) > 3 else "—",
    }

    for i in range(1, 6):
        w = weeks[i - 1] if i <= len(weeks) else None
        replacements[f"Module{i}"] = _module_title(w) if w else "—"
        replacements[f"m{i}_hours"] = _module_hours(w) if w else "—"

    co = _course_outcomes(data)
    for i in range(1, 5):
        replacements[f"CO{i}"] = co[i - 1] if i <= len(co) else "—"

    for i in range(1, 4):
        b = books[i - 1] if i <= len(books) else None
        replacements[f"Textbook{i}"] = f'"{b.get("title", "")}" by {b.get("author", "")}' if b else "—"
        replacements[f"Reference{i}"] = f'"{b.get("title", "")}" by {b.get("author", "")}' if b else "—"

    replacements["labs"] = _labs_list(data)
    return replacements


def _insert_logo_at_top(doc: Document, logo_path: str) -> None:
    """Insert a logo image in a new paragraph at the very top of the document."""
    if not os.path.isfile(logo_path):
        return
    p = doc.add_paragraph()
    run = p.add_run()
    run.add_picture(logo_path, width=Inches(1.5))
    p_element = p._element
    body = doc.element.body
    body.remove(p_element)
    body.insert(0, p_element)


def fill_template(data: Dict[str, Any], logo_path: Optional[str] = None) -> BytesIO:
    """
    Load template.docx, replace all placeholders with course data, return docx as bytes.
    If logo_path is provided and the file exists, the logo is inserted at the top.
    """
    if not os.path.isfile(TEMPLATE_PATH):
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")
    doc = Document(TEMPLATE_PATH)
    if logo_path and os.path.isfile(logo_path):
        _insert_logo_at_top(doc, logo_path)
    replacements = build_replacements(data)
    _replace_in_document(doc, replacements)
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
